from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, inspect, text, or_
from sqlalchemy.orm import Session, joinedload

from . import auth, models, schemas
from .db import engine, get_db, session_scope
from .settings import settings

app = FastAPI(
    title="resca.uz API",
    version="1.0.0",
    description="resca.uz — Restoran va Kafe CRM/POS tizimi backend API. Buyurtmalar, mahsulotlar, mijozlar, qarzlar va hisobotlarni boshqarish uchun REST API.",
    openapi_url="/openapi.json",
    contact={
        "name": "resca.uz",
        "url": "https://resca.uz/",
        "email": "webtexnogroup@gmail.com",
    },
    license_info={
        "name": "Proprietary",
    },
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")] if settings.CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    # Hozircha minimal: jadval yo‘q bo‘lsa yaratadi.
    # Keyinchalik Alembic migratsiyaga o‘tkazamiz.
    models.Base.metadata.create_all(bind=engine)
    # room_bookings keyin qo‘shilgan bo‘lsa, mavjud DB’da jadval bo‘lmasligi mumkin
    models.RoomBooking.__table__.create(bind=engine, checkfirst=True)
    _ensure_schema_migrations()
    _ensure_default_owner()
    _seed_sample_users()


def _ensure_schema_migrations() -> None:
    """Mavjud DB'da yangi ustunlar yo'q bo'lsa qo'shadi (yengil migratsiya)."""
    inspector = inspect(engine)
    venue_columns = {col["name"] for col in inspector.get_columns("venues")}
    if "logo_url" not in venue_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE venues ADD COLUMN logo_url TEXT"))
    user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "phone" not in user_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN phone TEXT"))
    # Inventory tables
    existing_tables = set(inspector.get_table_names())
    if "inventory_items" not in existing_tables:
        models.InventoryItem.__table__.create(bind=engine, checkfirst=True)
    if "inventory_transactions" not in existing_tables:
        models.InventoryTransaction.__table__.create(bind=engine, checkfirst=True)
    if "product_recipes" not in existing_tables:
        models.ProductRecipe.__table__.create(bind=engine, checkfirst=True)
    # item_type column migration
    if "inventory_items" in existing_tables:
        inv_cols = {col["name"] for col in inspector.get_columns("inventory_items")}
        if "item_type" not in inv_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE inventory_items ADD COLUMN item_type TEXT DEFAULT 'ingredient'"))
        if "pack_unit" not in inv_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE inventory_items ADD COLUMN pack_unit TEXT"))
        if "pack_size" not in inv_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE inventory_items ADD COLUMN pack_size NUMERIC(12,3) DEFAULT 1"))
        if "image_url" not in inv_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE inventory_items ADD COLUMN image_url TEXT"))
        # order_items jadvaliga batch_number va item_status ustunlarini backfill'dan oldin qo'shamiz
        if "order_items" in existing_tables:
            oi_cols = {col["name"] for col in inspector.get_columns("order_items")}
            if "batch_number" not in oi_cols:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE order_items ADD COLUMN batch_number INTEGER"))
            if "item_status" not in oi_cols:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE order_items ADD COLUMN item_status TEXT DEFAULT 'draft'"))
        # Eski mahsulotlar uchun boshlang'ich kirim tranzaksiyasi yaratish (xarajat hisobi uchun)
        _backfill_initial_transactions()
        _backfill_recipe_deductions()
    if "venue_settings" not in existing_tables:
        models.VenueSettings.__table__.create(bind=engine, checkfirst=True)
    if "expenses" not in existing_tables:
        models.Expense.__table__.create(bind=engine, checkfirst=True)
    if "push_subscriptions" not in existing_tables:
        models.PushSubscription.__table__.create(bind=engine, checkfirst=True)
    if "online_orders" not in existing_tables:
        models.OnlineOrder.__table__.create(bind=engine, checkfirst=True)
    else:
        oo_cols = {col["name"] for col in inspector.get_columns("online_orders")}
        if "telegram_user_id" not in oo_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE online_orders ADD COLUMN telegram_user_id TEXT"))
        if "telegram_username" not in oo_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE online_orders ADD COLUMN telegram_username TEXT"))
        if "pos_order_id" not in oo_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE online_orders ADD COLUMN pos_order_id INTEGER"))
        if "chef_id" not in oo_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE online_orders ADD COLUMN chef_id INTEGER"))
    if "telegram_customers" not in existing_tables:
        models.TelegramCustomer.__table__.create(bind=engine, checkfirst=True)
    # Venue ga telegram_bot_token ustuni
    venue_cols = {col["name"] for col in inspector.get_columns("venues")}
    if "telegram_bot_token" not in venue_cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE venues ADD COLUMN telegram_bot_token TEXT"))
    # orders jadvaliga source ustuni
    if "orders" in existing_tables:
        orders_cols = {col["name"] for col in inspector.get_columns("orders")}
        if "source" not in orders_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'pos'"))
        if "chef_id" not in orders_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE orders ADD COLUMN chef_id INTEGER"))
        if "waiter_closed" not in orders_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE orders ADD COLUMN waiter_closed BOOLEAN DEFAULT FALSE"))
    # Tariff / Subscription / Payment tables
    if "tariff_plans" not in existing_tables:
        models.TariffPlan.__table__.create(bind=engine, checkfirst=True)
    else:
        tp_cols = {col["name"] for col in inspector.get_columns("tariff_plans")}
        if "trial_days" not in tp_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tariff_plans ADD COLUMN trial_days INTEGER"))
    if "venue_subscriptions" not in existing_tables:
        models.VenueSubscription.__table__.create(bind=engine, checkfirst=True)
    if "payments" not in existing_tables:
        models.Payment.__table__.create(bind=engine, checkfirst=True)
    _seed_tariff_plans()


def _backfill_initial_transactions() -> None:
    """Eski ombor mahsulotlari uchun boshlang'ich kirim tranzaksiyasi yo'q bo'lsa yaratadi.
    Shuningdek, direct turidagi ombor mahsulotlari uchun mos Product yozuvi yaratadi."""
    from .db import session_scope as _ss
    with _ss() as db:
        items = db.scalars(select(models.InventoryItem)).all()
        for item in items:
            # Direct mahsulot uchun Product yaratish (yo'q bo'lsa)
            if item.item_type == "direct":
                existing_product = db.scalar(
                    select(models.Product).where(
                        models.Product.venue_id == item.venue_id,
                        models.Product.name == item.name,
                    )
                )
                if not existing_product and float(item.sell_price) > 0:
                    db.add(models.Product(
                        venue_id=item.venue_id,
                        name=item.name,
                        price=float(item.sell_price),
                        category=item.category or "Tayyor mahsulot",
                        image_url=item.image_url,
                        stock=int(float(item.quantity)) if float(item.quantity) > 0 else None,
                        is_available=True,
                    ))
            if float(item.cost_price) <= 0:
                continue
            # Bu item uchun allaqachon "Boshlang'ich kirim" tranzaksiyasi bormi?
            existing = db.scalar(
                select(models.InventoryTransaction).where(
                    models.InventoryTransaction.item_id == item.id,
                    models.InventoryTransaction.note.like("Boshlang'ich kirim%"),
                )
            )
            if existing:
                continue
            # Hech qanday "in" tranzaksiyasi yo'q bo'lsa ham yaratamiz
            any_in = db.scalar(
                select(models.InventoryTransaction).where(
                    models.InventoryTransaction.item_id == item.id,
                    models.InventoryTransaction.type == "in",
                ).limit(1)
            )
            if any_in:
                continue
            # Boshlang'ich miqdorni aniqlash (hozirgi quantity + sotilganlar)
            total_out = float(db.scalar(
                select(func.coalesce(func.sum(models.InventoryTransaction.quantity), 0)).where(
                    models.InventoryTransaction.item_id == item.id,
                    models.InventoryTransaction.type == "out",
                )
            ) or 0)
            initial_qty = float(item.quantity) + total_out
            if initial_qty <= 0:
                continue
            db.add(models.InventoryTransaction(
                venue_id=item.venue_id,
                item_id=item.id,
                type="in",
                quantity=initial_qty,
                note=f"Boshlang'ich kirim: {item.name}",
                created_by=None,
                created_at=item.created_at,
            ))
        # Direct mahsulotlar uchun Product kategoriyasini inventardagi bilan sinxronlash
        db.execute(
            text("""
                UPDATE products
                SET category = inventory_items.category
                FROM inventory_items
                WHERE inventory_items.name = products.name
                  AND inventory_items.item_type = 'direct'
                  AND inventory_items.venue_id = products.venue_id
                  AND products.category != inventory_items.category
            """)
        )
        db.commit()


def _backfill_recipe_deductions() -> None:
    """Avvalgi sotilgan buyurtmalar uchun retsept bo'yicha ombordan kamaytirish.
    Bir marta ishga tushadi va har bir ingredient uchun qancha kamaytirish
    kerakligini hisoblab, farqni amaldagi quantity'dan ayiradi.
    """
    from .db import session_scope as _ss
    with _ss() as db:
        venues = db.scalars(select(models.Venue)).all()
        for venue in venues:
            orders = db.scalars(
                select(models.Order).where(
                    models.Order.venue_id == venue.id,
                    models.Order.status.in_(["completed", "debt"]),
                )
            ).all()
            if not orders:
                continue

            expected_usage = {}
            for order in orders:
                for oi in order.items:
                    product = db.get(models.Product, oi.product_id)
                    if not product:
                        continue
                    qty_sold = float(oi.quantity)
                    recipes = db.scalars(
                        select(models.ProductRecipe).where(
                            models.ProductRecipe.product_id == oi.product_id
                        )
                    ).all()
                    if not recipes:
                        continue
                    for recipe in recipes:
                        deduct = float(recipe.quantity) * qty_sold
                        expected_usage[recipe.inventory_item_id] = (
                            expected_usage.get(recipe.inventory_item_id, 0) + deduct
                        )

            if not expected_usage:
                continue

            now = datetime.now(timezone.utc)
            for inv_item_id, total_qty in expected_usage.items():
                already = float(db.scalar(
                    select(func.coalesce(func.sum(models.InventoryTransaction.quantity), 0)).where(
                        models.InventoryTransaction.item_id == inv_item_id,
                        models.InventoryTransaction.type == "out",
                    )
                ) or 0)

                missing = round(total_qty - already, 3)
                if missing <= 0:
                    continue

                inv_item = db.get(models.InventoryItem, inv_item_id)
                if not inv_item or inv_item.venue_id != venue.id:
                    continue

                old_qty = float(inv_item.quantity)
                new_qty = max(0, old_qty - missing)
                inv_item.quantity = new_qty
                db.add(models.InventoryTransaction(
                    venue_id=venue.id,
                    item_id=inv_item.id,
                    type="out",
                    quantity=missing,
                    note=f"Avvalgi sotuvlar: retsept bo'yicha {missing:.3f} {inv_item.unit} kamaytirildi",
                    created_at=now,
                ))

            db.commit()


def _ensure_default_owner() -> None:
    default_username = "OwnerCrm"
    default_password = "Owner@2026"

    with session_scope() as db:
        owner = db.scalar(select(models.User).where(models.User.username == default_username))
        password_hash = auth.hash_password(default_password)

        if owner is None:
            owner = models.User(
                username=default_username,
                password_hash=password_hash,
                name="Owner",
                role="owner",
                venue_id=None,
            )
            db.add(owner)
            return

        # User mavjud bo'lsa ham owner credentiallarini barqaror saqlaymiz.
        owner.password_hash = password_hash
        owner.role = "owner"
        if not owner.name:
            owner.name = "Owner"
        db.add(owner)


def _seed_sample_users() -> None:
    """Namuna foydalanuvchilarni yaratadi (faqat rivojlantirish uchun)."""
    with session_scope() as db:
        venue = db.scalar(select(models.Venue).limit(1))
        if not venue:
            return
        venue_id = venue.id
        sample_users = [
            ("Waiter1", "waiter123", "Afitsiant 1", "waiter"),
            ("Waiter2", "waiter123", "Afitsiant 2", "waiter"),
            ("Oshpaz1", "oshpaz123", "Oshpaz 1", "oshpaz"),
            ("Oshpaz2", "oshpaz123", "Oshpaz 2", "oshpaz"),
            ("Dastavkachi1", "dastavkachi123", "Dastavkachi 1", "dastavkachi"),
            ("Dastavkachi2", "dastavkachi123", "Dastavkachi 2", "dastavkachi"),
        ]
        for username, password, name, role in sample_users:
            existing = db.scalar(select(models.User).where(models.User.username == username))
            if existing:
                continue
            db.add(models.User(
                username=username,
                password_hash=auth.hash_password(password),
                name=name,
                role=role,
                venue_id=venue_id,
            ))
        db.commit()


def _seed_tariff_plans() -> None:
    """Default tariff planlarni yaratadi yoki yangilaydi."""
    from .db import session_scope as _ss
    with _ss() as db:
        # Old plan nomlarini map qilish
        old_names = {
            "Boshlang'ich": "Free",
            "Standart": "Standart",
            "Premium": "Premium",
        }
        plans_data = [
            dict(
                name="Free",
                description="10 kunlik bepul sinov muddati bilan barcha funksiyalar ochiq",
                monthly_price=0,
                yearly_price=0,
                max_products=0,
                max_staff=0,
                features_json='["Barcha funksiyalar ochiq", "10 kun bepul"]',
                trial_days=10,
                is_active=True,
            ),
            dict(
                name="Standart",
                description="15 ta hodim va 100 xil mahsulot bilan barcha funksiyalar",
                monthly_price=299000,
                yearly_price=2990000,
                max_products=100,
                max_staff=15,
                features_json='["Barcha funksiyalar ochiq", "15 ta hodim", "100 xil mahsulot", "Telegram bot", "Ombor hisobi", "To\'liq hisobotlar"]',
                trial_days=None,
                is_active=True,
            ),
            dict(
                name="Premium",
                description="Barcha funksiyalar ochiq va cheksiz",
                monthly_price=599000,
                yearly_price=5990000,
                max_products=None,
                max_staff=None,
                features_json='["Barcha funksiyalar ochiq", "Cheksiz hodimlar", "Cheksiz mahsulotlar", "Telegram bot", "Ombor hisobi", "VIP qo\'llab-quvvatlash", "To\'liq hisobotlar"]',
                trial_days=None,
                is_active=True,
            ),
        ]
        for pd in plans_data:
            # Try old name first, then new name
            plan = db.scalar(select(models.TariffPlan).where(
                (models.TariffPlan.name == pd["name"]) |
                (models.TariffPlan.name == {v: k for k, v in old_names.items()}.get(pd["name"], ""))
            ).limit(1))
            if plan:
                for k, v in pd.items():
                    setattr(plan, k, v)
            else:
                db.add(models.TariffPlan(**pd))
        # Delete any remaining old-named plans not in the new set
        new_names = {pd["name"] for pd in plans_data}
        old_extra = [n for n in old_names if n not in new_names]
        for on in old_extra:
            leftover = db.scalar(select(models.TariffPlan).where(models.TariffPlan.name == on).limit(1))
            if leftover and leftover.id not in [s.tariff_plan_id for s in db.scalars(select(models.VenueSubscription)).all()]:
                db.delete(leftover)
        db.commit()


@app.get("/api/healthz", response_model=schemas.HealthStatus, tags=["health"])
async def health_check() -> schemas.HealthStatus:
    return schemas.HealthStatus(status="ok")


@app.post("/api/auth/login", response_model=schemas.AuthResponse, tags=["auth"])
async def login(payload: schemas.LoginInput, db: Session = Depends(get_db)) -> schemas.AuthResponse:
    user: models.User | None = db.scalar(select(models.User).where(models.User.username == payload.username))
    if not user or not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = auth.create_access_token(sub=user.username, user_id=user.id, role=user.role, venue_id=user.venue_id)
    venue_name = None
    if user.venue_id:
        venue = db.get(models.Venue, user.venue_id)
        venue_name = venue.name if venue else None
    return schemas.AuthResponse(
        user=schemas.User(
            id=user.id,
            username=user.username,
            name=user.name,
            phone=user.phone,
            role=user.role,  # type: ignore[arg-type]
            venueId=user.venue_id,
            venueName=venue_name,
            createdAt=user.created_at,
        ),
        token=token,
    )


@app.get("/api/auth/me", response_model=schemas.User, tags=["auth"])
async def get_me(current_user: schemas.User = Depends(auth.get_current_user)) -> schemas.User:
    return current_user


@app.post("/api/auth/logout", tags=["auth"])
async def logout() -> JSONResponse:
    # Agar kelajakda cookie/session ishlatilsa, shu yerda tozalash mumkin.
    return JSONResponse(content={"detail": "logged out"}, status_code=status.HTTP_200_OK)

def _now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)


def _start_of_today_utc() -> datetime:
    now = _now_utc()
    return datetime(year=now.year, month=now.month, day=now.day, tzinfo=timezone.utc)


def _require_venue_access(user: schemas.User, venue_id: int) -> None:
    if user.role == "owner":
        return
    if user.venueId != venue_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden for this venue")

def _require_admin_or_owner(user: schemas.User) -> None:
    if user.role not in ("owner", "admin", "kassir"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _venue_to_schema(db: Session, v: models.Venue) -> schemas.Venue:
    admin_name = None
    if v.admin_id:
        admin = db.get(models.User, v.admin_id)
        admin_name = (admin.name or admin.username) if admin else None
    return schemas.Venue(
        id=v.id,
        name=v.name,
        type=v.type,
        logoUrl=v.logo_url,
        address=v.address,
        phone=v.phone,
        email=v.email,
        instagram=v.instagram,
        telegram=v.telegram,
        facebook=v.facebook,
        telegramBotToken=v.telegram_bot_token,
        latitude=float(v.latitude) if v.latitude is not None else None,
        longitude=float(v.longitude) if v.longitude is not None else None,
        adminId=v.admin_id,
        adminName=admin_name,
        createdAt=v.created_at,
    )


def _user_to_schema(db: Session, u: models.User) -> schemas.User:
    venue_name = None
    if u.venue_id:
        venue = db.get(models.Venue, u.venue_id)
        venue_name = venue.name if venue else None
    return schemas.User(
        id=u.id,
        username=u.username,
        name=u.name,
        phone=u.phone,
        role=u.role,  # type: ignore[arg-type]
        venueId=u.venue_id,
        venueName=venue_name,
        createdAt=u.created_at,
    )


def _product_to_schema(p: models.Product) -> schemas.Product:
    return schemas.Product(
        id=p.id,
        venueId=p.venue_id,
        name=p.name,
        price=float(p.price),
        category=p.category,
        description=p.description,
        imageUrl=p.image_url,
        stock=p.stock,
        isAvailable=p.is_available,
        createdAt=p.created_at,
    )


def _room_to_schema(r: models.Room) -> schemas.Room:
    return schemas.Room(
        id=r.id,
        venueId=r.venue_id,
        name=r.name,
        description=r.description,
        isActive=r.is_active,
        createdAt=r.created_at,
    )


def _table_to_schema(t: models.Table) -> schemas.Table:
    return schemas.Table(
        id=t.id,
        venueId=t.venue_id,
        roomId=t.room_id,
        number=t.number,
        name=t.name,
        capacity=t.capacity,
        isActive=t.is_active,
        createdAt=t.created_at,
    )


def _booking_to_schema(b: models.RoomBooking) -> schemas.RoomBooking:
    return schemas.RoomBooking(
        id=b.id,
        venueId=b.venue_id,
        roomId=b.room_id,
        tableId=b.table_id,
        customerName=b.customer_name,
        customerPhone=b.customer_phone,
        startAt=b.start_at,
        endAt=b.end_at,
        notes=b.notes,
        status=b.status,  # type: ignore[arg-type]
        createdAt=b.created_at,
    )


def _order_item_to_open_item(i: models.OrderItem) -> schemas.OpenOrderItem:
    return schemas.OpenOrderItem(
        id=i.id,
        productId=i.product_id,
        productName=i.product_name,
        quantity=i.quantity,
        unitPrice=float(i.unit_price),
        discountPct=float(i.discount_pct),
        total=float(i.total),
        batchNumber=i.batch_number,
        itemStatus=i.item_status,
    )


@app.get("/api/venues", response_model=list[schemas.Venue], tags=["venues"])
async def list_venues(
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.Venue]:
    venues = db.scalars(select(models.Venue).order_by(models.Venue.id.asc())).all()
    return [_venue_to_schema(db, v) for v in venues]

# --- Staff (admin/owner/kassir) ---

STAFF_ROLES = ("kassir", "waiter", "oshpaz", "dastavkachi")

@app.get(
    "/api/venues/{venueId}/waiters",
    response_model=list[schemas.WaiterUser],
    tags=["staff"],
)
async def list_staff(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.WaiterUser]:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    staff = db.scalars(
        select(models.User)
        .where(models.User.venue_id == venueId, models.User.role.in_(STAFF_ROLES))
        .order_by(models.User.id.asc())
    ).all()
    return [
        schemas.WaiterUser(
            id=w.id,
            username=w.username,
            name=w.name,
            phone=w.phone,
            role=w.role,
            venueId=w.venue_id,
            createdAt=w.created_at,
        )
        for w in staff
    ]


@app.post(
    "/api/venues/{venueId}/waiters",
    response_model=schemas.WaiterUser,
    status_code=status.HTTP_201_CREATED,
    tags=["staff"],
)
async def create_staff(
    venueId: int,
    payload: schemas.CreateWaiterInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.WaiterUser:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    existing = db.scalar(select(models.User).where(models.User.username == payload.username))
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")
    role = payload.role or "waiter"
    if role not in STAFF_ROLES:
        raise HTTPException(status_code=422, detail=f"Invalid staff role: {role}")
    w = models.User(
        username=payload.username,
        password_hash=auth.hash_password(payload.password),
        name=payload.name,
        phone=payload.phone,
        role=role,
        venue_id=venueId,
    )
    db.add(w)
    db.flush()
    db.refresh(w)
    return schemas.WaiterUser(id=w.id, username=w.username, name=w.name, phone=w.phone, role=w.role, venueId=w.venue_id, createdAt=w.created_at)


@app.put(
    "/api/venues/{venueId}/waiters/{waiterId}",
    response_model=schemas.WaiterUser,
    tags=["staff"],
)
async def update_staff(
    venueId: int,
    waiterId: int,
    payload: schemas.UpdateWaiterInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.WaiterUser:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    w = db.get(models.User, waiterId)
    if not w or w.venue_id != venueId or w.role not in STAFF_ROLES:
        raise HTTPException(status_code=404, detail="Staff not found")
    if payload.username is not None:
        existing = db.scalar(select(models.User).where(models.User.username == payload.username, models.User.id != waiterId))
        if existing:
            raise HTTPException(status_code=409, detail="Username already exists")
        w.username = payload.username
    if payload.password is not None:
        w.password_hash = auth.hash_password(payload.password)
    if payload.name is not None:
        w.name = payload.name
    if payload.phone is not None:
        w.phone = payload.phone
    if payload.role is not None:
        if payload.role not in STAFF_ROLES:
            raise HTTPException(status_code=422, detail=f"Invalid staff role: {payload.role}")
        w.role = payload.role
    db.flush()
    db.refresh(w)
    return schemas.WaiterUser(id=w.id, username=w.username, name=w.name, phone=w.phone, role=w.role, venueId=w.venue_id, createdAt=w.created_at)


@app.delete(
    "/api/venues/{venueId}/waiters/{waiterId}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["staff"],
)
async def delete_staff(
    venueId: int,
    waiterId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> Response:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    w = db.get(models.User, waiterId)
    if not w or w.venue_id != venueId or w.role not in STAFF_ROLES:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.delete(w)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Open Orders (waiter/admin/owner within venue) ---

@app.get(
    "/api/venues/{venueId}/open-orders",
    response_model=list[schemas.ActiveOrder],
    tags=["orders"],
)
async def list_open_orders(
    venueId: int,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.ActiveOrder]:
    _require_venue_access(current_user, venueId)
    q = select(models.Order).options(joinedload(models.Order.items)).where(
        models.Order.venue_id == venueId,
        models.Order.source != "online",
    )

    # Afitsiant faqat o'zi yaratgan buyurtmalarni ko'radi
    if current_user.role == "waiter":
        q = q.where(models.Order.waiter_id == current_user.id)

    # Oshpaz faqat o'ziga biriktirilgan yoki biriktirilmagan buyurtmalarni ko'radi
    if current_user.role == "oshpaz":
        q = q.where(
            or_(
                models.Order.chef_id == current_user.id,
                models.Order.chef_id.is_(None),
            )
        )

    if status_filter and status_filter != "all":
        q = q.where(models.Order.status == status_filter)
    else:
        q = q.where(models.Order.status.in_(["open", "preparing", "ready"]))
    q = q.order_by(models.Order.id.desc())
    orders = db.scalars(q).unique().all()
    result: list[schemas.ActiveOrder] = []
    for o in orders:
        waiter_name = None
        if o.waiter_id:
            w = db.get(models.User, o.waiter_id)
            waiter_name = (w.name or w.username) if w else None
        # Oshpaz faqat oshxonaga yuborilgan item'larni ko'radi (draft emas)
        items = o.items
        if current_user.role == "oshpaz":
            items = [i for i in items if i.item_status != "draft"]
        # Agar oshpaz uchun hech qanday item qolmasa, buyurtmani ko'rsatmaymiz
        if current_user.role == "oshpaz" and not items:
            continue
        result.append(
            schemas.ActiveOrder(
                id=o.id,
                venueId=o.venue_id,
                tableId=o.table_id,
                tableNumber=o.table_number,
                roomId=o.room_id,
                roomName=o.room_name,
                waiterId=o.waiter_id,
                waiterName=waiter_name,
                totalAmount=float(o.total_amount),
                source=o.source,
                status=o.status,
                waiterClosed=bool(o.waiter_closed) if o.waiter_closed is not None else False,
                notes=o.notes,
                createdAt=o.created_at,
                items=[_order_item_to_open_item(i) for i in items],
            )
        )
    return result


def _check_table_not_booked(db: Session, venue_id: int, table_id: int) -> None:
    now = datetime.now(timezone.utc)
    booking = db.scalar(
        select(models.RoomBooking)
        .where(
            models.RoomBooking.venue_id == venue_id,
            models.RoomBooking.table_id == table_id,
            models.RoomBooking.status == "active",
            models.RoomBooking.start_at <= now,
            models.RoomBooking.end_at >= now,
        )
        .limit(1)
    )
    if booking:
        raise HTTPException(
            status_code=409,
            detail=f"Bu stol #{booking.id} ga bron qilingan ({booking.customer_name})",
        )
    # Also check room-level bookings for this table's room
    table = db.get(models.Table, table_id)
    if table and table.room_id:
        room_booking = db.scalar(
            select(models.RoomBooking)
            .where(
                models.RoomBooking.venue_id == venue_id,
                models.RoomBooking.room_id == table.room_id,
                models.RoomBooking.table_id.is_(None),
                models.RoomBooking.status == "active",
                models.RoomBooking.start_at <= now,
                models.RoomBooking.end_at >= now,
            )
            .limit(1)
        )
        if room_booking:
            raise HTTPException(
                status_code=409,
                detail=f"Bu xona (#{table.room_id}) ga bron qilingan ({room_booking.customer_name})",
            )


def _check_table_waiter_exclusivity(db: Session, venue_id: int, table_id: int, current_waiter_id: int, exclude_order_id: int | None = None) -> None:
    """Bir stolga faqat bitta afitsiant xizmat ko'rsatishi mumkin."""
    q = select(models.Order).where(
        models.Order.venue_id == venue_id,
        models.Order.table_id == table_id,
        models.Order.waiter_id.isnot(None),
        models.Order.waiter_closed == False,  # noqa: E712
        models.Order.status.in_(["open", "preparing", "ready"]),
    )
    if exclude_order_id:
        q = q.where(models.Order.id != exclude_order_id)
    existing = db.scalar(q.limit(1))
    if existing and existing.waiter_id != current_waiter_id:
        other = db.get(models.User, existing.waiter_id)
        other_name = (other.name or other.username) if other else "boshqa afitsiant"
        raise HTTPException(
            status_code=409,
            detail=f"Bu stolga {other_name} xizmat ko'rsatmoqda",
        )


def _recalc_open_order_total(db: Session, venue_id: int, items: list[schemas.CreateOpenOrderItemInput]) -> tuple[float, list[models.OrderItem]]:
    model_items: list[models.OrderItem] = []
    total_amount = 0.0
    for it in items:
        p = db.get(models.Product, it.productId)
        if not p or p.venue_id != venue_id:
            raise HTTPException(status_code=404, detail=f"Product {it.productId} not found")
        unit_price = float(p.price)
        discount_pct = float(it.discountPct or 0)
        line_total = unit_price * it.quantity * (1.0 - discount_pct / 100.0)
        total_amount += line_total
        model_items.append(
            models.OrderItem(
                order_id=0,  # placeholder
                product_id=p.id,
                product_name=p.name,
                quantity=it.quantity,
                unit_price=unit_price,
                discount_pct=discount_pct,
                total=line_total,
            )
        )
    return total_amount, model_items


@app.post(
    "/api/venues/{venueId}/open-orders",
    response_model=schemas.ActiveOrder,
    status_code=status.HTTP_201_CREATED,
    tags=["orders"],
)
async def create_open_order(
    venueId: int,
    payload: schemas.CreateOpenOrderInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.ActiveOrder:
    _require_venue_access(current_user, venueId)
    # Chegirma ruxsatlarini tekshirish
    has_discount = any((it.discountPct or 0) > 0 for it in payload.items)
    if has_discount:
        if current_user.role == "waiter":
            _require_setting_enabled(db, venueId, "waiterGiveDiscount")
        if current_user.role == "kassir":
            _require_setting_enabled(db, venueId, "kassirGiveDiscount")
    if payload.tableId:
        _check_table_not_booked(db, venueId, payload.tableId)
        if current_user.role == "waiter":
            _check_table_waiter_exclusivity(db, venueId, payload.tableId, current_user.id)
    total_amount, model_items = _recalc_open_order_total(db, venueId, payload.items)
    order = models.Order(
        venue_id=venueId,
        customer_id=None,
        waiter_id=current_user.id if current_user.role == "waiter" else None,
        waiter_closed=(current_user.role != "waiter"),  # waiter creates → closed=false; kassir/admin → closed=true
        room_id=payload.roomId,
        table_id=payload.tableId,
        table_number=payload.tableNumber,
        room_name=payload.roomName,
        total_amount=total_amount,
        payment_type="cash",
        payment_split=None,
        status="open",
        notes=payload.notes,
    )
    db.add(order)
    db.flush()
    for mi in model_items:
        mi.order_id = order.id
        db.add(mi)
    db.flush()
    db.refresh(order)
    order = db.scalar(select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == order.id))
    assert order
    waiter_name = None
    if order.waiter_id:
        wu = db.get(models.User, order.waiter_id)
        if wu:
            waiter_name = wu.name or wu.username
    return schemas.ActiveOrder(
        id=order.id,
        venueId=order.venue_id,
        tableId=order.table_id,
        tableNumber=order.table_number,
        roomId=order.room_id,
        roomName=order.room_name,
        waiterId=order.waiter_id,
        waiterName=waiter_name,
        totalAmount=float(order.total_amount),
        source=order.source,
        status=order.status,
        notes=order.notes,
        createdAt=order.created_at,
        items=[_order_item_to_open_item(i) for i in order.items],
    )


@app.get("/api/venues/{venueId}/orders/{orderId}", response_model=schemas.OrderDetail, tags=["orders"])
async def get_order_detail(
    venueId: int,
    orderId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.OrderDetail:
    _require_venue_access(current_user, venueId)
    o = db.scalar(select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == orderId, models.Order.venue_id == venueId))
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    customer_name = None
    if o.customer_id:
        c = db.get(models.Customer, o.customer_id)
        customer_name = c.name if c else None
    return schemas.OrderDetail(
        id=o.id,
        venueId=o.venue_id,
        customerId=o.customer_id,
        customerName=customer_name,
        totalAmount=float(o.total_amount),
        paymentType=o.payment_type,
        status=o.status,
        source=o.source,
        notes=o.notes,
        createdAt=o.created_at,
        items=[
            schemas.OrderItem(
                productId=i.product_id,
                productName=i.product_name,
                quantity=i.quantity,
                unitPrice=float(i.unit_price),
                discountPct=float(i.discount_pct),
                total=float(i.total),
            )
            for i in o.items
        ],
    )


@app.patch(
    "/api/venues/{venueId}/open-orders/{orderId}",
    response_model=schemas.ActiveOrder,
    tags=["orders"],
)
async def update_open_order(
    venueId: int,
    orderId: int,
    payload: schemas.UpdateOpenOrderInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.ActiveOrder:
    _require_venue_access(current_user, venueId)
    order = db.scalar(
        select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == orderId, models.Order.venue_id == venueId)
    )
    if not order or order.status != "open":
        raise HTTPException(status_code=404, detail="Open order not found")
    if current_user.role == "waiter" and order.waiter_id and order.waiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bu buyurtma sizga tegishli emas")
    if current_user.role == "waiter" and order.waiter_closed:
        raise HTTPException(status_code=403, detail="Buyurtma allaqachon yopilgan, kassirga topshirilgan")
    # Chegirma ruxsatlarini tekshirish
    has_discount = any((it.discountPct or 0) > 0 for it in payload.items)
    if has_discount:
        if current_user.role == "waiter":
            _require_setting_enabled(db, venueId, "waiterGiveDiscount")
        if current_user.role == "kassir":
            _require_setting_enabled(db, venueId, "kassirGiveDiscount")

    total_amount, model_items = _recalc_open_order_total(db, venueId, payload.items)
    order.total_amount = total_amount
    order.notes = payload.notes
    # Afitsiant buyurtmani yopmoqchi bo'lsa
    if payload.waiterClosed and current_user.role == "waiter" and order.waiter_id == current_user.id:
        order.waiter_closed = True
    # replace items
    for old in list(order.items):
        db.delete(old)
    db.flush()
    for mi in model_items:
        mi.order_id = order.id
        db.add(mi)
    db.flush()
    db.refresh(order)
    order = db.scalar(select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == order.id))
    assert order
    waiter_name = None
    if order.waiter_id:
        w = db.get(models.User, order.waiter_id)
        waiter_name = (w.name or w.username) if w else None
    return schemas.ActiveOrder(
        id=order.id,
        venueId=order.venue_id,
        tableId=order.table_id,
        tableNumber=order.table_number,
        roomId=order.room_id,
        roomName=order.room_name,
        waiterId=order.waiter_id,
        waiterName=waiter_name,
        totalAmount=float(order.total_amount),
        source=order.source,
        status=order.status,
        notes=order.notes,
        createdAt=order.created_at,
        items=[_order_item_to_open_item(i) for i in order.items],
    )


@app.post(
    "/api/venues/{venueId}/open-orders/{orderId}/items",
    response_model=schemas.ActiveOrder,
    status_code=status.HTTP_200_OK,
    tags=["orders"],
)
async def add_items_to_open_order(
    venueId: int,
    orderId: int,
    payload: schemas.UpdateOpenOrderInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.ActiveOrder:
    """Afitsiant mavjud buyurtmaga yangi mahsulotlar qo'shishi (avvalgilariga qo'shiladi, almashtirilmaydi)."""
    _require_venue_access(current_user, venueId)
    order = db.scalar(
        select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == orderId, models.Order.venue_id == venueId)
    )
    if not order or order.status not in ("open", "preparing", "ready"):
        raise HTTPException(status_code=404, detail="Open order not found")
    if current_user.role == "waiter" and order.waiter_id and order.waiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bu buyurtma sizga tegishli emas")
    if order.waiter_closed:
        raise HTTPException(status_code=403, detail="Buyurtma allaqachon yopilgan, kassirga topshirilgan")
    # Chegirma ruxsatlarini tekshirish
    has_discount = any((it.discountPct or 0) > 0 for it in payload.items)
    if has_discount:
        if current_user.role == "waiter":
            _require_setting_enabled(db, venueId, "waiterGiveDiscount")
        if current_user.role == "kassir":
            _require_setting_enabled(db, venueId, "kassirGiveDiscount")

    # Yangi mahsulotlarni qo'shish (avvalgilarini o'chirmay)
    for it in payload.items:
        p = db.get(models.Product, it.productId)
        if not p or p.venue_id != venueId:
            raise HTTPException(status_code=404, detail=f"Product {it.productId} not found")
        unit_price = float(p.price)
        discount_pct = float(it.discountPct or 0)
        line_total = unit_price * it.quantity * (1.0 - discount_pct / 100.0)
        order.total_amount = float(order.total_amount) + line_total
        order.items.append(
            models.OrderItem(
                order_id=order.id,
                product_id=p.id,
                product_name=p.name,
                quantity=it.quantity,
                unit_price=unit_price,
                discount_pct=discount_pct,
                total=line_total,
                batch_number=None,
                item_status="draft",
            )
        )
    if payload.notes:
        order.notes = (order.notes or "") + ("; " + payload.notes if order.notes else payload.notes)
    db.flush()
    db.refresh(order)
    order = db.scalar(select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == order.id))
    assert order
    waiter_name = None
    if order.waiter_id:
        w = db.get(models.User, order.waiter_id)
        waiter_name = (w.name or w.username) if w else None
    return schemas.ActiveOrder(
        id=order.id,
        venueId=order.venue_id,
        tableId=order.table_id,
        tableNumber=order.table_number,
        roomId=order.room_id,
        roomName=order.room_name,
        waiterId=order.waiter_id,
        waiterName=waiter_name,
        totalAmount=float(order.total_amount),
        source=order.source,
        status=order.status,
        waiterClosed=bool(order.waiter_closed),
        notes=order.notes,
        createdAt=order.created_at,
        items=[_order_item_to_open_item(i) for i in order.items],
    )


@app.post(
    "/api/venues/{venueId}/open-orders/{orderId}/send-batch",
    response_model=schemas.ActiveOrder,
    status_code=status.HTTP_200_OK,
    tags=["orders"],
)
async def send_batch_to_kitchen(
    venueId: int,
    orderId: int,
    payload: schemas.SendBatchInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.ActiveOrder:
    """Afitsiant draft items'larni oshxonaga yuboradi (batch yaratadi)."""
    _require_venue_access(current_user, venueId)
    order = db.scalar(
        select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == orderId, models.Order.venue_id == venueId)
    )
    if not order or order.status not in ("open", "preparing", "ready"):
        raise HTTPException(status_code=404, detail="Open order not found")
    if current_user.role == "waiter" and order.waiter_id and order.waiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bu buyurtma sizga tegishli emas")
    if order.waiter_closed:
        raise HTTPException(status_code=403, detail="Buyurtma allaqachon yopilgan")

    draft_items = [i for i in order.items if i.item_status == "draft" and i.batch_number is None]
    if not draft_items:
        raise HTTPException(status_code=400, detail="Oshxonaga yuboriladigan mahsulotlar yo'q")

    next_batch = (max((i.batch_number for i in order.items if i.batch_number is not None), default=0)) + 1
    for item in draft_items:
        item.batch_number = next_batch
        item.item_status = "sent"

    db.flush()
    db.refresh(order)
    order = db.scalar(select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == order.id))
    assert order
    waiter_name = None
    if order.waiter_id:
        w = db.get(models.User, order.waiter_id)
        waiter_name = (w.name or w.username) if w else None
    return schemas.ActiveOrder(
        id=order.id,
        venueId=order.venue_id,
        tableId=order.table_id,
        tableNumber=order.table_number,
        roomId=order.room_id,
        roomName=order.room_name,
        waiterId=order.waiter_id,
        waiterName=waiter_name,
        totalAmount=float(order.total_amount),
        source=order.source,
        status=order.status,
        waiterClosed=bool(order.waiter_closed),
        notes=order.notes,
        createdAt=order.created_at,
        items=[_order_item_to_open_item(i) for i in order.items],
    )


@app.patch(
    "/api/venues/{venueId}/open-orders/{orderId}/batch/{batchNumber}/status",
    response_model=schemas.ActiveOrder,
    tags=["orders"],
)
async def update_batch_status(
    venueId: int,
    orderId: int,
    batchNumber: int,
    payload: schemas.UpdateBatchStatusInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.ActiveOrder:
    """Oshpaz batch statusini o'zgartiradi (sent→preparing→ready)."""
    _require_venue_access(current_user, venueId)
    if current_user.role not in ("oshpaz", "admin", "owner"):
        raise HTTPException(status_code=403, detail="Faqat oshpaz va admin batch holatini o'zgartira oladi")

    order = db.scalar(
        select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == orderId, models.Order.venue_id == venueId)
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    batch_items = [i for i in order.items if i.batch_number == batchNumber]
    if not batch_items:
        raise HTTPException(status_code=404, detail="Batch not found")

    new_status = payload.status
    allowed = {"sent": ["preparing"], "preparing": ["ready"]}
    current_batch_status = batch_items[0].item_status
    if current_batch_status not in allowed or new_status not in allowed[current_batch_status]:
        raise HTTPException(status_code=400, detail=f"Holatni '{current_batch_status}' dan '{new_status}' ga o'zgartirish mumkin emas")

    for item in batch_items:
        item.item_status = new_status

    # Agar oshpaz birinchi marta buyurtma olayotgan bo'lsa, chef_id ni belgilaymiz
    if order.chef_id is None and current_user.role == "oshpaz":
        order.chef_id = current_user.id

    db.flush()
    db.refresh(order)
    order = db.scalar(select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == order.id))
    assert order
    waiter_name = None
    if order.waiter_id:
        w = db.get(models.User, order.waiter_id)
        waiter_name = (w.name or w.username) if w else None
    return schemas.ActiveOrder(
        id=order.id,
        venueId=order.venue_id,
        tableId=order.table_id,
        tableNumber=order.table_number,
        roomId=order.room_id,
        roomName=order.room_name,
        waiterId=order.waiter_id,
        waiterName=waiter_name,
        totalAmount=float(order.total_amount),
        source=order.source,
        status=order.status,
        waiterClosed=bool(order.waiter_closed),
        notes=order.notes,
        createdAt=order.created_at,
        items=[_order_item_to_open_item(i) for i in order.items],
    )


@app.patch(
    "/api/venues/{venueId}/open-orders/{orderId}/batch/{batchNumber}/serve",
    response_model=schemas.ActiveOrder,
    tags=["orders"],
)
async def serve_batch(
    venueId: int,
    orderId: int,
    batchNumber: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.ActiveOrder:
    """Afitsiant batch'dagi mahsulotlarni yetkazib berganini belgilaydi."""
    _require_venue_access(current_user, venueId)
    if current_user.role != "waiter":
        raise HTTPException(status_code=403, detail="Faqat afitsiant xizmat qilganini belgilay oladi")

    order = db.scalar(
        select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == orderId, models.Order.venue_id == venueId)
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.waiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bu buyurtma sizga tegishli emas")

    batch_items = [i for i in order.items if i.batch_number == batchNumber]
    if not batch_items:
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch_items[0].item_status != "ready":
        raise HTTPException(status_code=400, detail="Batch hali tayyor emas")

    for item in batch_items:
        item.item_status = "served"

    db.flush()
    db.refresh(order)
    order = db.scalar(select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == order.id))
    assert order
    waiter_name = None
    if order.waiter_id:
        w = db.get(models.User, order.waiter_id)
        waiter_name = (w.name or w.username) if w else None
    return schemas.ActiveOrder(
        id=order.id,
        venueId=order.venue_id,
        tableId=order.table_id,
        tableNumber=order.table_number,
        roomId=order.room_id,
        roomName=order.room_name,
        waiterId=order.waiter_id,
        waiterName=waiter_name,
        totalAmount=float(order.total_amount),
        source=order.source,
        status=order.status,
        waiterClosed=bool(order.waiter_closed),
        notes=order.notes,
        createdAt=order.created_at,
        items=[_order_item_to_open_item(i) for i in order.items],
    )


@app.delete(
    "/api/venues/{venueId}/open-orders/{orderId}/items/{itemId}",
    response_model=schemas.ActiveOrder,
    tags=["orders"],
)
async def storno_order_item(
    venueId: int,
    orderId: int,
    itemId: int,
    payload: schemas.StornoItemInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.ActiveOrder:
    """Kassir buyurtma item'ini storno qiladi (miqdorni kamaytiradi yoki butunlay o'chiradi)."""
    _require_venue_access(current_user, venueId)
    if current_user.role not in ("kassir", "admin", "owner"):
        raise HTTPException(status_code=403, detail="Faqat kassir va admin storno qila oladi")

    order = db.scalar(
        select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == orderId, models.Order.venue_id == venueId)
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    item = db.get(models.OrderItem, itemId)
    if not item or item.order_id != order.id:
        raise HTTPException(status_code=404, detail="Item not found")

    storno_qty = payload.quantity
    if storno_qty <= 0 or storno_qty > item.quantity:
        raise HTTPException(status_code=422, detail=f"Storno miqdori 1 dan {item.quantity} gacha bo'lishi kerak")

    if storno_qty == item.quantity:
        # Butunlay o'chirish
        order.total_amount = float(order.total_amount) - float(item.total)
        db.delete(item)
    else:
        # Qisman storno
        per_unit = float(item.total) / item.quantity
        storno_total = per_unit * storno_qty
        item.quantity -= storno_qty
        item.total = float(item.total) - storno_total
        order.total_amount = float(order.total_amount) - storno_total

    # Omborga qaytarish
    try:
        _deduct_inventory_on_sale(db, venueId, [item], reverse=True)
    except Exception:
        pass

    db.flush()
    db.refresh(order)
    order = db.scalar(select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == order.id))
    assert order
    waiter_name = None
    if order.waiter_id:
        w = db.get(models.User, order.waiter_id)
        waiter_name = (w.name or w.username) if w else None
    return schemas.ActiveOrder(
        id=order.id,
        venueId=order.venue_id,
        tableId=order.table_id,
        tableNumber=order.table_number,
        roomId=order.room_id,
        roomName=order.room_name,
        waiterId=order.waiter_id,
        waiterName=waiter_name,
        totalAmount=float(order.total_amount),
        source=order.source,
        status=order.status,
        waiterClosed=bool(order.waiter_closed),
        notes=order.notes,
        createdAt=order.created_at,
        items=[_order_item_to_open_item(i) for i in order.items],
    )


@app.patch("/api/venues/{venueId}/orders/{orderId}/kitchen-status", tags=["orders"])
async def update_order_kitchen_status(
    venueId: int,
    orderId: int,
    payload: schemas.KitchenStatusUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.ActiveOrder:
    _require_venue_access(current_user, venueId)
    if current_user.role not in ("oshpaz", "admin", "owner"):
        raise HTTPException(status_code=403, detail="Faqat oshpaz va admin buyurtma holatini o'zgartira oladi")
    
    order = db.scalar(
        select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == orderId, models.Order.venue_id == venueId)
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.source not in ("pos",):
        raise HTTPException(status_code=400, detail="Faqat oflayn buyurtmalar uchun")
    
    new_status = payload.status
    allowed_transitions = {
        "open": ["preparing"],
        "preparing": ["ready"],
        "ready": [],
    }
    if order.status not in allowed_transitions or new_status not in allowed_transitions[order.status]:
        raise HTTPException(status_code=400, detail=f"Holatni '{order.status}' dan '{new_status}' ga o'zgartirish mumkin emas")
    
    order.status = new_status
    # Oshpaz birinchi marta buyurtmani olganida chef_id ni belgilaymiz
    if order.chef_id is None and current_user.role in ("oshpaz",):
        order.chef_id = current_user.id
    db.flush()
    db.refresh(order)
    order = db.scalar(select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == order.id))
    assert order
    
    waiter_name = None
    if order.waiter_id:
        w = db.get(models.User, order.waiter_id)
        waiter_name = (w.name or w.username) if w else None
    return schemas.ActiveOrder(
        id=order.id,
        venueId=order.venue_id,
        tableId=order.table_id,
        tableNumber=order.table_number,
        roomId=order.room_id,
        roomName=order.room_name,
        waiterId=order.waiter_id,
        waiterName=waiter_name,
        totalAmount=float(order.total_amount),
        source=order.source,
        status=order.status,
        notes=order.notes,
        createdAt=order.created_at,
        items=[_order_item_to_open_item(i) for i in order.items],
    )


@app.delete(
    "/api/venues/{venueId}/open-orders/{orderId}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["orders"],
)
async def cancel_open_order(
    venueId: int,
    orderId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> Response:
    _require_venue_access(current_user, venueId)
    if current_user.role == "kassir":
        _require_setting_enabled(db, venueId, "kassirCancelReceipt")
    if current_user.role == "waiter":
        _require_setting_enabled(db, venueId, "waiterCancelOrder")
    order = db.get(models.Order, orderId)
    if not order or order.venue_id != venueId or order.status != "open":
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    if current_user.role == "waiter" and order.waiter_id and order.waiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bu buyurtma sizga tegishli emas")
    order.status = "cancelled"
    db.add(order)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.patch(
    "/api/venues/{venueId}/open-orders/{orderId}/waiter-close",
    response_model=schemas.ActiveOrder,
    tags=["orders"],
)
async def waiter_close_order(
    venueId: int,
    orderId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.ActiveOrder:
    """Afitsiant stoldagi barcha ochiq buyurtmalarini yopadi (davomiy turlar)."""
    _require_venue_access(current_user, venueId)
    if current_user.role != "waiter":
        raise HTTPException(status_code=403, detail="Faqat afitsiantlar yopishi mumkin")
    order = db.get(models.Order, orderId)
    if not order or order.venue_id != venueId or order.status not in ("open", "preparing", "ready"):
        raise HTTPException(status_code=404, detail="Order not found")
    if order.waiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bu buyurtma sizga tegishli emas")

    # Shu stoldagi afitsiantning barcha ochiq buyurtmalarini yopish
    all_orders = db.scalars(
        select(models.Order)
        .options(joinedload(models.Order.items))
        .where(
            models.Order.venue_id == venueId,
            models.Order.table_id == order.table_id,
            models.Order.waiter_id == current_user.id,
            models.Order.waiter_closed == False,
            models.Order.status.in_(["open", "preparing", "ready"]),
        )
    ).unique().all()

    if not all_orders:
        raise HTTPException(status_code=404, detail="Open order not found")

    for o in all_orders:
        o.waiter_closed = True
    db.flush()

    # Birlashtirilgan ma'lumotlarni qaytarish
    primary = all_orders[0]
    all_items = []
    for o in all_orders:
        for i in o.items:
            all_items.append(i)
    total = sum(float(o.total_amount) for o in all_orders)
    waiter_name = (current_user.name or current_user.username) if current_user else None
    return schemas.ActiveOrder(
        id=primary.id,
        venueId=primary.venue_id,
        tableId=primary.table_id,
        tableNumber=primary.table_number,
        roomId=primary.room_id,
        roomName=primary.room_name,
        waiterId=primary.waiter_id,
        waiterName=waiter_name,
        totalAmount=total,
        source=primary.source,
        status=primary.status,
        waiterClosed=True,
        notes=f"{len(all_orders)} ta tur",
        createdAt=primary.created_at,
        items=[_order_item_to_open_item(i) for i in all_items],
    )


@app.post(
    "/api/venues/{venueId}/open-orders/{orderId}/pay",
    response_model=schemas.PayOpenOrderResult,
    tags=["orders"],
)
async def pay_open_order(
    venueId: int,
    orderId: int,
    payload: schemas.PayOpenOrderInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.PayOpenOrderResult:
    _require_venue_access(current_user, venueId)
    # Chegirma ruxsatlarini tekshirish
    if payload.items:
        has_discount = any((it.discountPct or 0) > 0 for it in payload.items)
        if has_discount:
            if current_user.role == "waiter":
                _require_setting_enabled(db, venueId, "waiterGiveDiscount")
            if current_user.role == "kassir":
                _require_setting_enabled(db, venueId, "kassirGiveDiscount")

    # Agar tableId berilgan bo'lsa, shu stoldagi barcha yopiq buyurtmalarni birlashtirib to'lash
    if payload.tableId:
        all_orders = db.scalars(
            select(models.Order)
            .options(joinedload(models.Order.items))
            .where(
                models.Order.venue_id == venueId,
                models.Order.table_id == payload.tableId,
                models.Order.waiter_closed == True,
                models.Order.status.in_(["open", "preparing", "ready"]),
            )
            .order_by(models.Order.id)
        ).unique().all()
        if not all_orders:
            raise HTTPException(status_code=404, detail="Bu stolda to'lanadigan buyurtmalar yo'q")
        if current_user.role == "waiter" and any(o.waiter_id != current_user.id for o in all_orders):
            raise HTTPException(status_code=403, detail="Bu buyurtmalar sizga tegishli emas")

        total_amount = sum(float(o.total_amount) for o in all_orders)
        for o in all_orders:
            o.payment_type = payload.paymentType
            o.payment_split = json.dumps(payload.paymentSplit) if payload.paymentSplit else None
            o.notes = payload.notes or o.notes
            o.customer_id = payload.customerId
            o.status = "debt" if payload.paymentType == "debt" else "completed"
        db.flush()

        if payload.paymentType == "debt":
            if not payload.customerId:
                raise HTTPException(status_code=422, detail="customerId is required for debt payments")
            debt_amount = total_amount
            if payload.paymentSplit:
                try:
                    debt_amount = float(payload.paymentSplit.get("debt") or 0)
                except Exception:
                    debt_amount = total_amount
            if debt_amount <= 0:
                debt_amount = total_amount
            for o in all_orders:
                debt = db.scalar(select(models.Debt).where(models.Debt.order_id == o.id))
                if debt is None:
                    db.add(
                        models.Debt(
                            venue_id=venueId,
                            customer_id=payload.customerId,
                            order_id=o.id,
                            amount=debt_amount / len(all_orders),
                            paid_amount=0,
                            status="unpaid",
                            paid_at=None,
                        )
                    )

        for o in all_orders:
            if o.source != "online":
                _deduct_inventory_on_sale(db, venueId, list(o.items))

        try:
            location_parts = []
            if all_orders[0].room_name:
                location_parts.append(all_orders[0].room_name)
            if all_orders[0].table_number:
                location_parts.append(f"Stol #{all_orders[0].table_number}")
            location = " · ".join(location_parts)
            first_order = all_orders[0]
            order_ids = ", ".join(str(o.id) for o in all_orders)
            items_str = _order_items_text(first_order.items) if first_order.items else ""
            tg_body = f"Buyurtma #{order_ids}"
            if location:
                tg_body += f"\nJoy: {location}"
            if items_str:
                tg_body += f"\n\n{items_str}"
            tg_body += f"\n\nJami: {total_amount:,.0f} so'm"
            _send_push_notification(
                db, venueId,
                title=f"💰 Yangi sotuv (birlashtirilgan)",
                body=f"Summa: {total_amount:,.0f} so'm · {len(all_orders)} ta buyurtma",
                url="/admin/report",
            )
            _send_telegram_notification(
                db, venueId,
                title="Yangi sotuv (birlashtirilgan)",
                body=tg_body,
            )
        except Exception:
            pass

        return schemas.PayOpenOrderResult(
            id=all_orders[0].id,
            status=all_orders[0].status,
            totalAmount=total_amount,
            orderCount=len(all_orders),
        )

    # Bitta buyurtmani to'lash (avvalgi holat)
    order = db.scalar(
        select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == orderId, models.Order.venue_id == venueId)
    )
    if not order or order.status not in ("open", "preparing", "ready"):
        raise HTTPException(status_code=404, detail="Open order not found")
    # Afitsiant buyurtmani yopmagan bo'lsa, kassir va admin to'lay olmaydi
    if order.waiter_id and not order.waiter_closed and current_user.role != "owner":
        if current_user.id != order.waiter_id:
            raise HTTPException(status_code=403, detail="Buyurtma hali afitsiant tomonidan yopilmagan")
    if current_user.role == "waiter" and order.waiter_id and order.waiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bu buyurtma sizga tegishli emas")

    # optionally replace items before paying
    if payload.items is not None:
        total_amount, model_items = _recalc_open_order_total(db, venueId, payload.items)
        order.total_amount = total_amount
        for old in list(order.items):
            db.delete(old)
        order.items.clear()
        db.flush()
        for mi in model_items:
            order.items.append(mi)

    order.payment_type = payload.paymentType
    order.payment_split = json.dumps(payload.paymentSplit) if payload.paymentSplit else None
    order.notes = payload.notes or order.notes
    order.customer_id = payload.customerId
    order.status = "debt" if payload.paymentType == "debt" else "completed"
    db.flush()
    db.refresh(order)

    if payload.paymentType == "debt":
        if not payload.customerId:
            raise HTTPException(status_code=422, detail="customerId is required for debt payments")
        debt_amount = float(order.total_amount)
        if payload.paymentSplit:
            try:
                debt_amount = float(payload.paymentSplit.get("debt") or 0)
            except Exception:
                debt_amount = float(order.total_amount)
        if debt_amount <= 0:
            debt_amount = float(order.total_amount)
        debt = db.scalar(select(models.Debt).where(models.Debt.order_id == order.id))
        if debt is None:
            db.add(
                models.Debt(
                    venue_id=venueId,
                    customer_id=payload.customerId,
                    order_id=order.id,
                    amount=debt_amount,
                    paid_amount=0,
                    status="unpaid",
                    paid_at=None,
                )
            )

    # Ombor mahsulotlarini kamaytirish (onlayn buyurtmalar uchun qabul qilishda kamaytirilgan)
    if order.source != "online":
        _deduct_inventory_on_sale(db, venueId, list(order.items))

    # Push notification — to'lov bajarildi
    try:
        location_parts = []
        if order.room_name:
            location_parts.append(order.room_name)
        if order.table_number:
            location_parts.append(f"Stol #{order.table_number}")
        location = " · ".join(location_parts)
        items_str = _order_items_text(order.items) if hasattr(order, 'items') and order.items else ""
        tg_body = f"Buyurtma #{order.id}"
        if location:
            tg_body += f"\nJoy: {location}"
        if items_str:
            tg_body += f"\n\n{items_str}"
        tg_body += f"\n\nJami: {float(order.total_amount):,.0f} so'm"
        _send_push_notification(
            db, venueId,
            title=f"💰 Yangi sotuv #{order.id}",
            body=f"Summa: {float(order.total_amount):,.0f} so'm · {order.payment_type}",
            url="/admin/report",
        )
        _send_telegram_notification(
            db, venueId,
            title="Yangi sotuv",
            body=tg_body,
        )
    except Exception:
        pass

    return schemas.PayOpenOrderResult(id=order.id, status=order.status, totalAmount=float(order.total_amount))

@app.post(
    "/api/venues",
    response_model=schemas.Venue,
    status_code=status.HTTP_201_CREATED,
    tags=["venues"],
)
async def create_venue(
    payload: schemas.VenueInput,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.Venue:
    v = models.Venue(
        name=payload.name,
        type=payload.type,
        logo_url=payload.logoUrl,
        address=payload.address,
        phone=payload.phone,
        email=payload.email,
        instagram=payload.instagram,
        telegram=payload.telegram,
        facebook=payload.facebook,
        telegram_bot_token=payload.telegramBotToken,
        admin_id=None,
    )
    db.add(v)
    db.flush()
    db.refresh(v)
    return _venue_to_schema(db, v)


@app.get("/api/venues/{id}", response_model=schemas.Venue, tags=["venues"])
async def get_venue(
    id: int,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.get_current_user),
) -> schemas.Venue:
    v = db.get(models.Venue, id)
    if not v:
        raise HTTPException(status_code=404, detail="Venue not found")
    return _venue_to_schema(db, v)


@app.patch("/api/venues/{id}", response_model=schemas.Venue, tags=["venues"])
async def update_venue(
    id: int,
    payload: schemas.VenueUpdate,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.Venue:
    v = db.get(models.Venue, id)
    if not v:
        raise HTTPException(status_code=404, detail="Venue not found")
    patch = payload.model_dump(exclude_unset=True)
    if "logoUrl" in patch:
        patch["logo_url"] = patch.pop("logoUrl")
    if "telegramBotToken" in patch:
        patch["telegram_bot_token"] = patch.pop("telegramBotToken")
    for k, val in patch.items():
        setattr(v, k, val)
    db.add(v)
    db.flush()
    db.refresh(v)
    return _venue_to_schema(db, v)


@app.delete(
    "/api/venues/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["venues"],
)
async def delete_venue(
    id: int,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> Response:
    v = db.get(models.Venue, id)
    if not v:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.delete(v)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post(
    "/api/venues/{id}/assign-admin",
    response_model=schemas.User,
    tags=["venues"],
)
async def assign_venue_admin(
    id: int,
    payload: schemas.AdminAssignInput,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.User:
    v = db.get(models.Venue, id)
    if not v:
        raise HTTPException(status_code=404, detail="Venue not found")
    u = db.get(models.User, payload.userId)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    v.admin_id = u.id
    u.venue_id = v.id
    u.role = "admin" if u.role != "owner" else u.role
    db.add_all([v, u])
    db.flush()
    db.refresh(u)
    return _user_to_schema(db, u)


@app.get(
    "/api/venues/{id}/stats",
    response_model=schemas.VenueStats,
    tags=["venues"],
)
async def get_venue_stats(
    id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.VenueStats:
    _require_venue_access(current_user, id)
    start = _start_of_today_utc()
    today_sales = db.scalar(
        select(func.coalesce(func.sum(models.Order.total_amount), 0)).where(
            models.Order.venue_id == id, models.Order.created_at >= start
        )
    )
    total_revenue = db.scalar(
        select(func.coalesce(func.sum(models.Order.total_amount), 0)).where(models.Order.venue_id == id)
    )
    total_debts = db.scalar(
        select(func.coalesce(func.sum(models.Debt.amount - models.Debt.paid_amount), 0)).where(
            models.Debt.venue_id == id
        )
    )
    product_count = db.scalar(select(func.count()).select_from(models.Product).where(models.Product.venue_id == id))
    order_count = db.scalar(select(func.count()).select_from(models.Order).where(models.Order.venue_id == id))
    return schemas.VenueStats(
        todaySales=float(today_sales or 0),
        totalRevenue=float(total_revenue or 0),
        totalDebts=float(total_debts or 0),
        productCount=int(product_count or 0),
        orderCount=int(order_count or 0),
    )


@app.get(
    "/api/venues/{venueId}/products",
    response_model=list[schemas.Product],
    tags=["products"],
)
async def list_products(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.Product]:
    _require_venue_access(current_user, venueId)
    products = db.scalars(select(models.Product).where(models.Product.venue_id == venueId)).all()
    return [_product_to_schema(p) for p in products]


@app.post(
    "/api/venues/{venueId}/products",
    response_model=schemas.Product,
    status_code=status.HTTP_201_CREATED,
    tags=["products"],
)
async def create_product(
    venueId: int,
    payload: schemas.ProductInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.Product:
    _require_venue_access(current_user, venueId)
    p = models.Product(
        venue_id=venueId,
        name=payload.name,
        price=payload.price,
        category=payload.category,
        description=payload.description,
        image_url=payload.imageUrl,
        stock=payload.stock,
        is_available=bool(payload.isAvailable) if payload.isAvailable is not None else True,
    )
    db.add(p)
    db.flush()
    db.refresh(p)
    return _product_to_schema(p)


@app.patch(
    "/api/venues/{venueId}/products/{id}",
    response_model=schemas.Product,
    tags=["products"],
)
async def update_product(
    venueId: int,
    id: int,
    payload: schemas.ProductUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.Product:
    _require_venue_access(current_user, venueId)
    p = db.get(models.Product, id)
    if not p or p.venue_id != venueId:
        raise HTTPException(status_code=404, detail="Product not found")
    patch = payload.model_dump(exclude_unset=True)
    if "imageUrl" in patch:
        patch["image_url"] = patch.pop("imageUrl")
    if "isAvailable" in patch:
        patch["is_available"] = patch.pop("isAvailable")
    for k, val in patch.items():
        setattr(p, k, val)
    db.add(p)
    db.flush()
    db.refresh(p)
    return _product_to_schema(p)


@app.delete(
    "/api/venues/{venueId}/products/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["products"],
)
async def delete_product(
    venueId: int,
    id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> Response:
    _require_venue_access(current_user, venueId)
    p = db.get(models.Product, id)
    if not p or p.venue_id != venueId:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.delete(p)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/api/venues/{venueId}/customers",
    response_model=list[schemas.Customer],
    tags=["customers"],
)
async def list_customers(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.Customer]:
    _require_venue_access(current_user, venueId)
    customers = db.scalars(select(models.Customer).where(models.Customer.venue_id == venueId)).all()
    result: list[schemas.Customer] = []
    for c in customers:
        debt_sum = db.scalar(
            select(func.coalesce(func.sum(models.Debt.amount - models.Debt.paid_amount), 0)).where(
                models.Debt.venue_id == venueId, models.Debt.customer_id == c.id
            )
        )
        result.append(
            schemas.Customer(
                id=c.id,
                venueId=c.venue_id,
                name=c.name,
                phone=c.phone,
                totalDebt=float(debt_sum or 0),
                createdAt=c.created_at,
            )
        )
    return result


@app.post(
    "/api/venues/{venueId}/customers",
    response_model=schemas.Customer,
    status_code=status.HTTP_201_CREATED,
    tags=["customers"],
)
async def create_customer(
    venueId: int,
    payload: schemas.CustomerInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.Customer:
    _require_venue_access(current_user, venueId)
    c = models.Customer(venue_id=venueId, name=payload.name, phone=payload.phone)
    db.add(c)
    db.flush()
    db.refresh(c)
    return schemas.Customer(
        id=c.id,
        venueId=c.venue_id,
        name=c.name,
        phone=c.phone,
        totalDebt=0.0,
        createdAt=c.created_at,
    )


@app.get(
    "/api/venues/{venueId}/customers/{id}",
    response_model=schemas.Customer,
    tags=["customers"],
)
async def get_customer(
    venueId: int,
    id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.Customer:
    _require_venue_access(current_user, venueId)
    c = db.get(models.Customer, id)
    if not c or c.venue_id != venueId:
        raise HTTPException(status_code=404, detail="Customer not found")
    debt_sum = db.scalar(
        select(func.coalesce(func.sum(models.Debt.amount - models.Debt.paid_amount), 0)).where(
            models.Debt.venue_id == venueId, models.Debt.customer_id == c.id
        )
    )
    return schemas.Customer(
        id=c.id,
        venueId=c.venue_id,
        name=c.name,
        phone=c.phone,
        totalDebt=float(debt_sum or 0),
        createdAt=c.created_at,
    )


@app.get(
    "/api/venues/{venueId}/orders",
    response_model=list[schemas.Order],
    tags=["orders"],
)
async def list_orders(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.Order]:
    _require_venue_access(current_user, venueId)
    orders = db.scalars(
        select(models.Order).where(models.Order.venue_id == venueId).order_by(models.Order.id.desc())
    ).all()
    result: list[schemas.Order] = []
    for o in orders:
        customer_name = None
        if o.customer_id:
            c = db.get(models.Customer, o.customer_id)
            customer_name = c.name if c else None
        payment_split = None
        if o.payment_split:
            try:
                payment_split = schemas.PaymentSplit(**json.loads(o.payment_split))
            except Exception:
                payment_split = None
        result.append(
            schemas.Order(
                id=o.id,
                venueId=o.venue_id,
                customerId=o.customer_id,
                customerName=customer_name,
                totalAmount=float(o.total_amount),
                paymentType=o.payment_type,  # type: ignore[arg-type]
                paymentSplit=payment_split,
                status=o.status,  # type: ignore[arg-type]
                source=o.source,
                notes=o.notes,
                createdAt=o.created_at,
            )
        )
    return result


@app.post(
    "/api/venues/{venueId}/orders",
    response_model=schemas.OrderDetail,
    status_code=status.HTTP_201_CREATED,
    tags=["orders"],
)
async def create_order(
    venueId: int,
    payload: schemas.OrderInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.OrderDetail:
    _require_venue_access(current_user, venueId)
    # Chegirma ruxsatlarini tekshirish
    has_discount = any((it.discountPct or 0) > 0 for it in payload.items)
    if has_discount:
        if current_user.role == "waiter":
            _require_setting_enabled(db, venueId, "waiterGiveDiscount")
        if current_user.role == "kassir":
            _require_setting_enabled(db, venueId, "kassirGiveDiscount")
    if payload.tableId:
        _check_table_not_booked(db, venueId, payload.tableId)
    items_out: list[schemas.OrderItem] = []
    total_amount = 0.0

    for item_in in payload.items:
        p = db.get(models.Product, item_in.productId)
        if not p or p.venue_id != venueId:
            raise HTTPException(status_code=404, detail=f"Product {item_in.productId} not found")
        unit_price = float(p.price)
        discount_pct = float(item_in.discountPct or 0)
        line_total = unit_price * item_in.quantity * (1.0 - discount_pct / 100.0)
        total_amount += line_total
        items_out.append(
            schemas.OrderItem(
                productId=p.id,
                productName=p.name,
                quantity=item_in.quantity,
                unitPrice=unit_price,
                discountPct=discount_pct,
                total=float(line_total),
            )
        )

    payment_split_str = None
    if payload.paymentSplit is not None:
        payment_split_str = json.dumps(payload.paymentSplit.model_dump())

    order = models.Order(
        venue_id=venueId,
        customer_id=payload.customerId,
        waiter_id=None if current_user.role == "owner" else current_user.id,
        room_id=payload.roomId,
        table_id=payload.tableId,
        table_number=payload.tableNumber,
        room_name=payload.roomName,
        total_amount=total_amount,
        payment_type=payload.paymentType,
        payment_split=payment_split_str,
        status="debt" if payload.paymentType == "debt" else "completed",
        notes=payload.notes,
    )
    db.add(order)
    db.flush()

    for item_in, item_out in zip(payload.items, items_out, strict=True):
        db.add(
            models.OrderItem(
                order_id=order.id,
                product_id=item_in.productId,
                product_name=item_out.productName,
                quantity=item_in.quantity,
                unit_price=item_out.unitPrice,
                discount_pct=float(item_out.discountPct or 0),
                total=float(item_out.total),
            )
        )

    # create debt row if needed
    if payload.paymentType == "debt":
        if not payload.customerId:
            raise HTTPException(status_code=422, detail="customerId is required for debt payments")
        debt_amount = total_amount
        if payload.paymentSplit is not None:
            try:
                debt_amount = float(payload.paymentSplit.debt or 0)
            except Exception:
                debt_amount = total_amount
        if debt_amount <= 0:
            debt_amount = total_amount
        db.add(
            models.Debt(
                venue_id=venueId,
                customer_id=payload.customerId,
                order_id=order.id,
                amount=debt_amount,
                paid_amount=0,
                status="unpaid",
                paid_at=None,
            )
        )

    db.flush()
    db.refresh(order)

    # Ombor mahsulotlarini kamaytirish
    order_items_for_deduction = db.scalars(
        select(models.OrderItem).where(models.OrderItem.order_id == order.id)
    ).all()
    _deduct_inventory_on_sale(db, venueId, order_items_for_deduction)

    # Push notification — yangi sotuv
    try:
        location_parts = []
        if order.room_name:
            location_parts.append(order.room_name)
        if order.table_number:
            location_parts.append(f"Stol #{order.table_number}")
        location = " · ".join(location_parts)
        items_str = _order_items_text(order_items_for_deduction) if order_items_for_deduction else ""
        tg_body = f"Buyurtma #{order.id}"
        if location:
            tg_body += f"\nJoy: {location}"
        if items_str:
            tg_body += f"\n\n{items_str}"
        tg_body += f"\n\nJami: {float(order.total_amount):,.0f} so'm"
        _send_push_notification(
            db, venueId,
            title=f"💰 Yangi sotuv #{order.id}",
            body=f"Summa: {float(order.total_amount):,.0f} so'm · {order.payment_type}",
            url="/admin/report",
        )
        _send_telegram_notification(
            db, venueId,
            title="Yangi sotuv",
            body=tg_body,
        )
    except Exception:
        pass

    customer_name = None
    if order.customer_id:
        c = db.get(models.Customer, order.customer_id)
        customer_name = c.name if c else None

    return schemas.OrderDetail(
        id=order.id,
        venueId=order.venue_id,
        customerId=order.customer_id,
        customerName=customer_name,
        totalAmount=float(order.total_amount),
        paymentType=order.payment_type,  # type: ignore[arg-type]
        paymentSplit=payload.paymentSplit,
        status=order.status,  # type: ignore[arg-type]
        source=order.source,
        notes=order.notes,
        items=items_out,
        createdAt=order.created_at,
    )


@app.get(
    "/api/venues/{venueId}/orders/{id}",
    response_model=schemas.OrderDetail,
    tags=["orders"],
)
async def get_order(
    venueId: int,
    id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.OrderDetail:
    _require_venue_access(current_user, venueId)
    order = db.scalar(
        select(models.Order)
        .options(joinedload(models.Order.items))
        .where(models.Order.id == id, models.Order.venue_id == venueId)
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    customer_name = None
    if order.customer_id:
        c = db.get(models.Customer, order.customer_id)
        customer_name = c.name if c else None
    payment_split = None
    if order.payment_split:
        try:
            payment_split = schemas.PaymentSplit(**json.loads(order.payment_split))
        except Exception:
            payment_split = None
    items = [
        schemas.OrderItem(
            productId=i.product_id,
            productName=i.product_name,
            quantity=i.quantity,
            unitPrice=float(i.unit_price),
            discountPct=float(i.discount_pct),
            total=float(i.total),
        )
        for i in order.items
    ]
    return schemas.OrderDetail(
        id=order.id,
        venueId=order.venue_id,
        customerId=order.customer_id,
        customerName=customer_name,
        totalAmount=float(order.total_amount),
        paymentType=order.payment_type,  # type: ignore[arg-type]
        paymentSplit=payment_split,
        status=order.status,  # type: ignore[arg-type]
        source=order.source,
        notes=order.notes,
        items=items,
        createdAt=order.created_at,
    )


@app.get(
    "/api/venues/{venueId}/debts",
    response_model=list[schemas.Debt],
    tags=["debts"],
)
async def list_debts(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.Debt]:
    _require_venue_access(current_user, venueId)
    debts = db.scalars(select(models.Debt).where(models.Debt.venue_id == venueId).order_by(models.Debt.id.desc())).all()
    result: list[schemas.Debt] = []
    for d in debts:
        c = db.get(models.Customer, d.customer_id)
        remaining = float(d.amount) - float(d.paid_amount)
        result.append(
            schemas.Debt(
                id=d.id,
                venueId=d.venue_id,
                customerId=d.customer_id,
                customerName=c.name if c else "Unknown",
                customerPhone=c.phone if c else None,
                orderId=d.order_id,
                amount=float(d.amount),
                paidAmount=float(d.paid_amount),
                remaining=remaining,
                status=d.status,  # type: ignore[arg-type]
                paidAt=d.paid_at,
                createdAt=d.created_at,
            )
        )
    return result


@app.patch(
    "/api/venues/{venueId}/debts/{id}/pay",
    response_model=schemas.Debt,
    tags=["debts"],
)
async def pay_debt(
    venueId: int,
    id: int,
    payload: schemas.DebtPayInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.Debt:
    _require_venue_access(current_user, venueId)
    d = db.get(models.Debt, id)
    if not d or d.venue_id != venueId:
        raise HTTPException(status_code=404, detail="Debt not found")
    new_paid = float(d.paid_amount) + payload.amount
    remaining = max(float(d.amount) - new_paid, 0.0)
    if remaining <= 0:
        d.status = "paid"
        d.paid_at = _now_utc()
        d.paid_amount = float(d.amount)
    elif new_paid <= 0:
        d.status = "unpaid"
        d.paid_amount = 0
    else:
        d.status = "partial"
        d.paid_amount = new_paid
    db.add(d)
    db.flush()
    db.refresh(d)
    c = db.get(models.Customer, d.customer_id)
    return schemas.Debt(
        id=d.id,
        venueId=d.venue_id,
        customerId=d.customer_id,
        customerName=c.name if c else "Unknown",
        customerPhone=c.phone if c else None,
        orderId=d.order_id,
        amount=float(d.amount),
        paidAmount=float(d.paid_amount),
        remaining=max(float(d.amount) - float(d.paid_amount), 0.0),
        status=d.status,  # type: ignore[arg-type]
        paidAt=d.paid_at,
        createdAt=d.created_at,
    )


@app.get(
    "/api/venues/{venueId}/summary",
    response_model=schemas.DashboardSummary,
    tags=["venues"],
)
async def get_venue_summary(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.DashboardSummary:
    _require_venue_access(current_user, venueId)
    start = _start_of_today_utc()
    today_revenue = db.scalar(
        select(func.coalesce(func.sum(models.Order.total_amount), 0)).where(
            models.Order.venue_id == venueId, models.Order.created_at >= start
        )
    )
    today_order_count = db.scalar(
        select(func.count()).select_from(models.Order).where(models.Order.venue_id == venueId, models.Order.created_at >= start)
    )
    total_debt = db.scalar(
        select(func.coalesce(func.sum(models.Debt.amount - models.Debt.paid_amount), 0)).where(models.Debt.venue_id == venueId)
    )
    unpaid_debt_count = db.scalar(
        select(func.count()).select_from(models.Debt).where(models.Debt.venue_id == venueId, models.Debt.status != "paid")
    )
    recent = db.scalars(
        select(models.Order).where(models.Order.venue_id == venueId).order_by(models.Order.id.desc()).limit(10)
    ).all()
    recent_orders = [
        schemas.Order(
            id=o.id,
            venueId=o.venue_id,
            customerId=o.customer_id,
            customerName=(db.get(models.Customer, o.customer_id).name if o.customer_id and db.get(models.Customer, o.customer_id) else None),
            totalAmount=float(o.total_amount),
            paymentType=o.payment_type,  # type: ignore[arg-type]
            paymentSplit=(schemas.PaymentSplit(**json.loads(o.payment_split)) if o.payment_split else None),
            status=o.status,  # type: ignore[arg-type]
            notes=o.notes,
            createdAt=o.created_at,
        )
        for o in recent
    ]
    return schemas.DashboardSummary(
        todayRevenue=float(today_revenue or 0),
        todayOrderCount=int(today_order_count or 0),
        totalDebt=float(total_debt or 0),
        unpaidDebtCount=int(unpaid_debt_count or 0),
        topProducts=[],
        recentOrders=recent_orders,
    )


@app.get(
    "/api/venues/{venueId}/report",
    response_model=schemas.SalesReport,
    tags=["venues"],
)
async def get_venue_report(
    venueId: int,
    year: int | None = None,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.SalesReport:
    _require_venue_access(current_user, venueId)
    yr = year or _now_utc().year
    start = datetime(yr, 1, 1, tzinfo=timezone.utc)
    end = datetime(yr + 1, 1, 1, tzinfo=timezone.utc)
    orders = db.scalars(
        select(models.Order)
        .options(joinedload(models.Order.items))
        .where(models.Order.venue_id == venueId, models.Order.created_at >= start, models.Order.created_at < end)
        .order_by(models.Order.created_at.asc())
    ).unique().all()
    total_revenue = sum(float(o.total_amount) for o in orders)
    total_orders = len(orders)

    # month -> (revenue, count)
    month_map: dict[int, dict[str, float | int]] = {m: {"revenue": 0.0, "count": 0} for m in range(1, 13)}
    for o in orders:
        # Exclude cancelled orders from revenue stats
        if o.status == "cancelled":
            continue
        m = int(o.created_at.month)
        month_map[m]["revenue"] = float(month_map[m]["revenue"]) + float(o.total_amount)
        month_map[m]["count"] = int(month_map[m]["count"]) + 1

    month_names = [
        "Yanvar",
        "Fevral",
        "Mart",
        "Aprel",
        "May",
        "Iyun",
        "Iyul",
        "Avgust",
        "Sentyabr",
        "Oktyabr",
        "Noyabr",
        "Dekabr",
    ]
    monthly_sales: list[schemas.SalesReportMonth] = [
        schemas.SalesReportMonth(
            month=m,
            monthName=month_names[m - 1],
            revenue=float(month_map[m]["revenue"]),
            orderCount=int(month_map[m]["count"]),
        )
        for m in range(1, 13)
    ]
    all_orders: list[schemas.OrderDetail] = []
    for o in orders:
        customer_name = None
        if o.customer_id:
            c = db.get(models.Customer, o.customer_id)
            customer_name = c.name if c else None
        payment_split = None
        if o.payment_split:
            try:
                payment_split = schemas.PaymentSplit(**json.loads(o.payment_split))
            except Exception:
                payment_split = None
        all_orders.append(
            schemas.OrderDetail(
                id=o.id,
                venueId=o.venue_id,
                customerId=o.customer_id,
                customerName=customer_name,
                totalAmount=float(o.total_amount),
                paymentType=o.payment_type,  # type: ignore[arg-type]
                paymentSplit=payment_split,
                status=o.status,  # type: ignore[arg-type]
                source=o.source,
                notes=o.notes,
                items=[
                    schemas.OrderItem(
                        productId=i.product_id,
                        productName=i.product_name,
                        quantity=i.quantity,
                        unitPrice=float(i.unit_price),
                        discountPct=float(i.discount_pct),
                        total=float(i.total),
                    )
                    for i in o.items
                ],
                createdAt=o.created_at,
            )
        )
    return schemas.SalesReport(
        year=yr,
        totalRevenue=float(total_revenue),
        totalOrders=total_orders,
        monthlySales=monthly_sales,
        allOrders=all_orders,
    )


@app.get(
    "/api/owner/summary",
    response_model=schemas.OwnerSummary,
    tags=["venues"],
)
async def get_owner_summary(
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.OwnerSummary:
    venues = db.scalars(select(models.Venue)).all()
    venue_stats: list[schemas.VenueStat] = []
    total_revenue = 0.0
    total_debt = 0.0
    start = _start_of_today_utc()
    for v in venues:
        today_rev = db.scalar(
            select(func.coalesce(func.sum(models.Order.total_amount), 0)).where(
                models.Order.venue_id == v.id, models.Order.created_at >= start
            )
        )
        venue_debt = db.scalar(
            select(func.coalesce(func.sum(models.Debt.amount - models.Debt.paid_amount), 0)).where(models.Debt.venue_id == v.id)
        )
        order_count = db.scalar(select(func.count()).select_from(models.Order).where(models.Order.venue_id == v.id, models.Order.created_at >= start))
        total_revenue += float(today_rev or 0)
        total_debt += float(venue_debt or 0)
        venue_stats.append(
            schemas.VenueStat(
                venueId=v.id,
                venueName=v.name,
                todayRevenue=float(today_rev or 0),
                totalDebt=float(venue_debt or 0),
                orderCount=int(order_count or 0),
            )
        )
    return schemas.OwnerSummary(
        totalVenues=len(venues),
        totalRevenue=float(total_revenue),
        totalDebt=float(total_debt),
        venueStats=venue_stats,
    )


# ─── Tariff Plans ───


@app.get("/api/tariff-plans", response_model=list[schemas.TariffPlan], tags=["tariff"])
async def list_tariff_plans(
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> list[schemas.TariffPlan]:
    plans = db.scalars(select(models.TariffPlan).order_by(models.TariffPlan.monthly_price)).all()
    return [_plan_to_schema(p) for p in plans]


def _plan_to_schema(p: models.TariffPlan) -> schemas.TariffPlan:
    return schemas.TariffPlan(
        id=p.id,
        name=p.name,
        description=p.description,
        monthlyPrice=float(p.monthly_price),
        yearlyPrice=float(p.yearly_price),
        maxProducts=p.max_products,
        maxStaff=p.max_staff,
        featuresJson=p.features_json,
        trialDays=p.trial_days,
        isActive=p.is_active,
        createdAt=p.created_at,
    )


@app.post("/api/tariff-plans", response_model=schemas.TariffPlan, tags=["tariff"], status_code=201)
async def create_tariff_plan(
    payload: schemas.TariffPlanInput,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.TariffPlan:
    p = models.TariffPlan(
        name=payload.name,
        description=payload.description,
        monthly_price=payload.monthlyPrice,
        yearly_price=payload.yearlyPrice,
        max_products=payload.maxProducts,
        max_staff=payload.maxStaff,
        features_json=payload.featuresJson,
        trial_days=payload.trialDays,
        is_active=payload.isActive,
    )
    db.add(p)
    db.flush()
    db.refresh(p)
    return _plan_to_schema(p)


@app.patch("/api/tariff-plans/{plan_id}", response_model=schemas.TariffPlan, tags=["tariff"])
async def update_tariff_plan(
    plan_id: int,
    payload: schemas.TariffPlanInput,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.TariffPlan:
    p = db.get(models.TariffPlan, plan_id)
    if not p:
        raise HTTPException(404, "Tariff plan not found")
    p.name = payload.name
    p.description = payload.description
    p.monthly_price = payload.monthlyPrice
    p.yearly_price = payload.yearlyPrice
    p.max_products = payload.maxProducts
    p.max_staff = payload.maxStaff
    p.features_json = payload.featuresJson
    p.trial_days = payload.trialDays
    p.is_active = payload.isActive
    db.flush()
    db.refresh(p)
    return _plan_to_schema(p)


@app.delete("/api/tariff-plans/{plan_id}", status_code=204, tags=["tariff"], response_model=None)
async def delete_tariff_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> None:
    p = db.get(models.TariffPlan, plan_id)
    if not p:
        raise HTTPException(404, "Tariff plan not found")
    # Unlink subscriptions
    subs = db.scalars(select(models.VenueSubscription).where(models.VenueSubscription.tariff_plan_id == plan_id)).all()
    for s in subs:
        s.status = "cancelled"
    db.delete(p)
    db.flush()


# ─── Venue Subscriptions ───


@app.get("/api/subscriptions", response_model=list[schemas.VenueSubscriptionSchema], tags=["subscriptions"])
async def list_subscriptions(
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> list[schemas.VenueSubscriptionSchema]:
    subs = db.scalars(select(models.VenueSubscription).order_by(models.VenueSubscription.created_at.desc())).all()
    result: list[schemas.VenueSubscriptionSchema] = []
    for s in subs:
        venue = db.get(models.Venue, s.venue_id)
        plan = db.get(models.TariffPlan, s.tariff_plan_id)
        result.append(schemas.VenueSubscriptionSchema(
            id=s.id,
            venueId=s.venue_id,
            tariffPlanId=s.tariff_plan_id,
            startDate=s.start_date,
            endDate=s.end_date,
            status=s.status,
            billingCycle=s.billing_cycle,
            autoRenew=s.auto_renew,
            createdAt=s.created_at,
            updatedAt=s.updated_at,
            tariffPlan=_plan_to_schema(plan) if plan else None,
            venueName=venue.name if venue else None,
        ))
    return result


@app.get("/api/venues/{venue_id}/subscription", response_model=schemas.VenueSubscriptionSchema | None, tags=["subscriptions"])
async def get_venue_subscription(
    venue_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.VenueSubscriptionSchema | None:
    _require_venue_access(current_user, venue_id)
    s = db.scalar(
        select(models.VenueSubscription).where(
            models.VenueSubscription.venue_id == venue_id,
            models.VenueSubscription.status == "active",
        ).limit(1)
    )
    if not s:
        return None
    plan = db.get(models.TariffPlan, s.tariff_plan_id)
    venue = db.get(models.Venue, s.venue_id)
    return schemas.VenueSubscriptionSchema(
        id=s.id,
        venueId=s.venue_id,
        tariffPlanId=s.tariff_plan_id,
        startDate=s.start_date,
        endDate=s.end_date,
        status=s.status,
        billingCycle=s.billing_cycle,
        autoRenew=s.auto_renew,
        createdAt=s.created_at,
        updatedAt=s.updated_at,
        tariffPlan=_plan_to_schema(plan) if plan else None,
        venueName=venue.name if venue else None,
    )


@app.post("/api/venues/{venue_id}/subscription", response_model=schemas.VenueSubscriptionSchema, tags=["subscriptions"], status_code=201)
async def create_venue_subscription(
    venue_id: int,
    payload: schemas.VenueSubscriptionInput,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.VenueSubscriptionSchema:
    venue = db.get(models.Venue, venue_id)
    if not venue:
        raise HTTPException(404, "Venue not found")
    plan = db.get(models.TariffPlan, payload.tariffPlanId)
    if not plan:
        raise HTTPException(404, "Tariff plan not found")

    # Cancel old active subscription if exists
    old = db.scalar(
        select(models.VenueSubscription).where(
            models.VenueSubscription.venue_id == venue_id,
            models.VenueSubscription.status == "active",
        ).limit(1)
    )
    if old:
        old.status = "cancelled"

    now = _now_utc()
    if payload.billingCycle == "yearly":
        end_date = now.replace(year=now.year + 1)
    else:
        end_date = now.replace(month=now.month + 1) if now.month < 12 else now.replace(year=now.year + 1, month=1)

    s = models.VenueSubscription(
        venue_id=venue_id,
        tariff_plan_id=payload.tariffPlanId,
        start_date=now,
        end_date=end_date,
        status="active",
        billing_cycle=payload.billingCycle,
        auto_renew=payload.autoRenew,
    )
    db.add(s)
    db.flush()
    db.refresh(s)
    return schemas.VenueSubscriptionSchema(
        id=s.id,
        venueId=s.venue_id,
        tariffPlanId=s.tariff_plan_id,
        startDate=s.start_date,
        endDate=s.end_date,
        status=s.status,
        billingCycle=s.billing_cycle,
        autoRenew=s.auto_renew,
        createdAt=s.created_at,
        updatedAt=s.updated_at,
        tariffPlan=_plan_to_schema(plan),
        venueName=venue.name,
    )


@app.patch("/api/subscriptions/{sub_id}", response_model=schemas.VenueSubscriptionSchema, tags=["subscriptions"])
async def update_subscription(
    sub_id: int,
    payload: schemas.VenueSubscriptionInput,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.VenueSubscriptionSchema:
    s = db.get(models.VenueSubscription, sub_id)
    if not s:
        raise HTTPException(404, "Subscription not found")
    plan = db.get(models.TariffPlan, payload.tariffPlanId)
    if not plan:
        raise HTTPException(404, "Tariff plan not found")
    s.tariff_plan_id = payload.tariffPlanId
    s.billing_cycle = payload.billingCycle
    s.auto_renew = payload.autoRenew
    now = _now_utc()
    if payload.billingCycle == "yearly":
        s.end_date = now.replace(year=now.year + 1)
    else:
        s.end_date = now.replace(month=now.month + 1) if now.month < 12 else now.replace(year=now.year + 1, month=1)
    db.add(s)
    db.flush()
    db.refresh(s)
    venue = db.get(models.Venue, s.venue_id)
    return schemas.VenueSubscriptionSchema(
        id=s.id,
        venueId=s.venue_id,
        tariffPlanId=s.tariff_plan_id,
        startDate=s.start_date,
        endDate=s.end_date,
        status=s.status,
        billingCycle=s.billing_cycle,
        autoRenew=s.auto_renew,
        createdAt=s.created_at,
        updatedAt=s.updated_at,
        tariffPlan=_plan_to_schema(plan),
        venueName=venue.name if venue else None,
    )


# ─── Payments ───


@app.get("/api/payments", response_model=list[schemas.PaymentSchema], tags=["payments"])
async def list_payments(
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> list[schemas.PaymentSchema]:
    payments = db.scalars(select(models.Payment).order_by(models.Payment.created_at.desc())).all()
    result: list[schemas.PaymentSchema] = []
    for pm in payments:
        venue = db.get(models.Venue, pm.venue_id)
        result.append(_payment_to_schema(pm, venue.name if venue else None))
    return result


@app.post("/api/payments", response_model=schemas.PaymentSchema, tags=["payments"], status_code=201)
async def create_payment(
    payload: schemas.PaymentInput,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.PaymentSchema:
    venue = db.get(models.Venue, payload.venueId)
    if not venue:
        raise HTTPException(404, "Venue not found")
    pm = models.Payment(
        venue_id=payload.venueId,
        subscription_id=payload.subscriptionId,
        amount=payload.amount,
        currency=payload.currency,
        status=payload.status,
        payment_method=payload.paymentMethod,
        billing_cycle=payload.billingCycle,
        notes=payload.notes,
        paid_at=payload.paidAt or _now_utc(),
    )
    db.add(pm)
    db.flush()
    db.refresh(pm)
    return _payment_to_schema(pm, venue.name)


@app.patch("/api/payments/{payment_id}", response_model=schemas.PaymentSchema, tags=["payments"])
async def update_payment(
    payment_id: int,
    payload: schemas.PaymentInput,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.PaymentSchema:
    pm = db.get(models.Payment, payment_id)
    if not pm:
        raise HTTPException(404, "Payment not found")
    if pm.status == "paid":
        raise HTTPException(400, "To'langan to'lovni o'zgartirib bo'lmaydi")
    venue = db.get(models.Venue, payload.venueId)
    if not venue:
        raise HTTPException(404, "Venue not found")
    pm.venue_id = payload.venueId
    pm.subscription_id = payload.subscriptionId
    pm.amount = payload.amount
    pm.currency = payload.currency
    pm.status = payload.status
    pm.payment_method = payload.paymentMethod
    pm.billing_cycle = payload.billingCycle
    pm.notes = payload.notes
    if payload.paidAt:
        pm.paid_at = payload.paidAt
    db.flush()
    db.refresh(pm)
    return _payment_to_schema(pm, venue.name)


def _payment_to_schema(pm: models.Payment, venue_name: str | None = None) -> schemas.PaymentSchema:
    return schemas.PaymentSchema(
        id=pm.id,
        venueId=pm.venue_id,
        subscriptionId=pm.subscription_id,
        amount=float(pm.amount),
        currency=pm.currency,
        status=pm.status,
        paymentMethod=pm.payment_method,
        billingCycle=pm.billing_cycle,
        notes=pm.notes,
        paidAt=pm.paid_at,
        createdAt=pm.created_at,
        venueName=venue_name,
    )


# ─── Owner Dashboard Stats ───


@app.get("/api/owner/dashboard", response_model=schemas.OwnerDashboardStats, tags=["owner"])
async def get_owner_dashboard(
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.OwnerDashboardStats:
    venues = db.scalars(select(models.Venue).order_by(models.Venue.created_at.desc())).all()
    now = _now_utc()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    # Monthly revenue from payments
    monthly_rev = db.scalar(
        select(func.coalesce(func.sum(models.Payment.amount), 0)).where(
            models.Payment.status == "paid",
            models.Payment.created_at >= month_start,
        )
    )
    # Yearly revenue from payments
    yearly_rev = db.scalar(
        select(func.coalesce(func.sum(models.Payment.amount), 0)).where(
            models.Payment.status == "paid",
            models.Payment.created_at >= year_start,
        )
    )

    # Subscriptions
    active_subs = db.scalar(
        select(func.count()).select_from(models.VenueSubscription).where(
            models.VenueSubscription.status == "active"
        )
    )
    expired_subs = db.scalar(
        select(func.count()).select_from(models.VenueSubscription).where(
            models.VenueSubscription.status == "expired"
        )
    )

    # Recent payments (last 20)
    recent_pmts = db.scalars(
        select(models.Payment).order_by(models.Payment.created_at.desc()).limit(20)
    ).all()
    recent_payments: list[schemas.PaymentSchema] = []
    for pm in recent_pmts:
        v = db.get(models.Venue, pm.venue_id)
        recent_payments.append(_payment_to_schema(pm, v.name if v else None))

    # Latest venues (last 10)
    latest_venues: list[schemas.VenueStat] = []
    for v in venues[:10]:
        today_rev = db.scalar(
            select(func.coalesce(func.sum(models.Order.total_amount), 0)).where(
                models.Order.venue_id == v.id, models.Order.created_at >= month_start
            )
        )
        venue_debt = db.scalar(
            select(func.coalesce(func.sum(models.Debt.amount - models.Debt.paid_amount), 0)).where(models.Debt.venue_id == v.id)
        )
        order_count = db.scalar(
            select(func.count()).select_from(models.Order).where(
                models.Order.venue_id == v.id, models.Order.created_at >= month_start
            )
        )
        latest_venues.append(schemas.VenueStat(
            venueId=v.id,
            venueName=v.name,
            todayRevenue=float(today_rev or 0),
            totalDebt=float(venue_debt or 0),
            orderCount=int(order_count or 0),
        ))

    # All venue subscriptions
    subs = db.scalars(select(models.VenueSubscription).order_by(models.VenueSubscription.created_at.desc())).all()
    venue_subs: list[schemas.VenueSubscriptionSchema] = []
    for s in subs:
        v = db.get(models.Venue, s.venue_id)
        plan = db.get(models.TariffPlan, s.tariff_plan_id)
        venue_subs.append(schemas.VenueSubscriptionSchema(
            id=s.id,
            venueId=s.venue_id,
            tariffPlanId=s.tariff_plan_id,
            startDate=s.start_date,
            endDate=s.end_date,
            status=s.status,
            billingCycle=s.billing_cycle,
            autoRenew=s.auto_renew,
            createdAt=s.created_at,
            updatedAt=s.updated_at,
            tariffPlan=_plan_to_schema(plan) if plan else None,
            venueName=v.name if v else None,
        ))

    # ── Chart data ──
    all_pmts = db.scalars(select(models.Payment).order_by(models.Payment.created_at.desc())).all()
    chart_payments = []
    for pm in all_pmts:
        v = db.get(models.Venue, pm.venue_id)
        plan = None
        if pm.subscription_id:
            sub = db.get(models.VenueSubscription, pm.subscription_id)
            if sub:
                plan = db.get(models.TariffPlan, sub.tariff_plan_id)
        chart_payments.append({
            "pm": pm, "venue": v, "plan": plan,
            "amount": float(pm.amount),
        })

    total_revenue = sum(p["amount"] for p in chart_payments if p["pm"].status == "paid")
    paid_count = sum(1 for p in chart_payments if p["pm"].status == "paid")
    pending_count = sum(1 for p in chart_payments if p["pm"].status == "pending")
    failed_count = sum(1 for p in chart_payments if p["pm"].status == "failed")

    # Daily (current month)
    daily_map: dict[int, list[float]] = {}
    for p in chart_payments:
        if p["pm"].status != "paid":
            continue
        if p["pm"].created_at.year != now.year or p["pm"].created_at.month != now.month:
            continue
        day = p["pm"].created_at.day
        daily_map.setdefault(day, []).append(p["amount"])
    daily_breakdown = [
        schemas.RevenueByDay(year=now.year, month=now.month, day=d, total=sum(vals), count=len(vals))
        for d, vals in sorted(daily_map.items())
    ]

    # Monthly (current year)
    monthly_map: dict[int, list[float]] = {}
    for p in chart_payments:
        if p["pm"].status != "paid":
            continue
        if p["pm"].created_at.year != now.year:
            continue
        month = p["pm"].created_at.month
        monthly_map.setdefault(month, []).append(p["amount"])
    monthly_breakdown = [
        schemas.RevenueByMonth(year=now.year, month=m, total=sum(vals), count=len(vals))
        for m, vals in sorted(monthly_map.items())
    ]

    # Yearly (all years)
    yearly_map: dict[int, list[float]] = {}
    for p in chart_payments:
        if p["pm"].status != "paid":
            continue
        y = p["pm"].created_at.year
        yearly_map.setdefault(y, []).append(p["amount"])
    yearly_breakdown = [
        schemas.RevenueByMonth(year=y, month=0, total=sum(vals), count=len(vals))
        for y, vals in sorted(yearly_map.items())
    ]

    # By venue
    venue_map: dict[int, dict] = {}
    for p in chart_payments:
        vid = p["pm"].venue_id
        if vid not in venue_map:
            venue_map[vid] = {"name": p["venue"].name if p["venue"] else f"#{vid}", "total": 0.0, "count": 0}
        if p["pm"].status == "paid":
            venue_map[vid]["total"] += p["amount"]
            venue_map[vid]["count"] += 1
    by_venue = [
        schemas.RevenueByVenue(venueId=vid, venueName=d["name"], total=d["total"], count=d["count"])
        for vid, d in sorted(venue_map.items(), key=lambda x: x[1]["total"], reverse=True)
    ]

    # By tariff
    tariff_map: dict[int, dict] = {}
    for p in chart_payments:
        tid = p["plan"].id if p["plan"] else 0
        if tid not in tariff_map:
            tariff_map[tid] = {"name": p["plan"].name if p["plan"] else "Noma'lum", "total": 0.0, "count": 0}
        if p["pm"].status == "paid":
            tariff_map[tid]["total"] += p["amount"]
            tariff_map[tid]["count"] += 1
    by_tariff = [
        schemas.RevenueByTariff(tariffPlanId=tid, tariffName=d["name"], total=d["total"], count=d["count"])
        for tid, d in sorted(tariff_map.items(), key=lambda x: x[1]["total"], reverse=True)
    ]

    return schemas.OwnerDashboardStats(
        totalVenues=len(venues),
        totalMonthlyRevenue=float(monthly_rev or 0),
        totalYearlyRevenue=float(yearly_rev or 0),
        activeSubscriptions=int(active_subs or 0),
        expiredSubscriptions=int(expired_subs or 0),
        recentPayments=recent_payments,
        latestVenues=latest_venues,
        venueSubscriptions=venue_subs,
        totalRevenue=float(total_revenue),
        paidCount=paid_count,
        pendingCount=pending_count,
        failedCount=failed_count,
        dailyBreakdown=daily_breakdown,
        monthlyBreakdown=monthly_breakdown,
        yearlyBreakdown=yearly_breakdown,
        byVenue=by_venue,
        byTariff=by_tariff,
    )


# ─── Owner Reports ───


@app.get("/api/owner/reports", response_model=schemas.OwnerReport, tags=["owner"])
async def get_owner_reports(
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.OwnerReport:
    payments = db.scalars(select(models.Payment).order_by(models.Payment.created_at.desc())).all()
    all_payments = []
    for pm in payments:
        v = db.get(models.Venue, pm.venue_id)
        plan = None
        if pm.subscription_id:
            sub = db.get(models.VenueSubscription, pm.subscription_id)
            if sub:
                plan = db.get(models.TariffPlan, sub.tariff_plan_id)
        all_payments.append({
            "pm": pm, "venue": v, "plan": plan,
            "amount": float(pm.amount),
        })

    now = _now_utc()
    current_year = now.year
    current_month = now.month

    total_revenue = sum(p["amount"] for p in all_payments if p["pm"].status == "paid")
    paid_count = sum(1 for p in all_payments if p["pm"].status == "paid")
    pending_count = sum(1 for p in all_payments if p["pm"].status == "pending")
    failed_count = sum(1 for p in all_payments if p["pm"].status == "failed")

    # Daily breakdown (current month)
    daily_map: dict[int, list[float]] = {}
    for p in all_payments:
        if p["pm"].status != "paid":
            continue
        if p["pm"].created_at.year != current_year or p["pm"].created_at.month != current_month:
            continue
        day = p["pm"].created_at.day
        daily_map.setdefault(day, []).append(p["amount"])
    daily_breakdown = [
        schemas.RevenueByDay(year=current_year, month=current_month, day=d, total=sum(vals), count=len(vals))
        for d, vals in sorted(daily_map.items())
    ]

    # Monthly breakdown (current year)
    monthly_map: dict[int, list[float]] = {}
    for p in all_payments:
        if p["pm"].status != "paid":
            continue
        if p["pm"].created_at.year != current_year:
            continue
        month = p["pm"].created_at.month
        monthly_map.setdefault(month, []).append(p["amount"])
    monthly_breakdown = [
        schemas.RevenueByMonth(year=current_year, month=m, total=sum(vals), count=len(vals))
        for m, vals in sorted(monthly_map.items())
    ]

    # Yearly breakdown (all years)
    yearly_map: dict[int, list[float]] = {}
    for p in all_payments:
        if p["pm"].status != "paid":
            continue
        y = p["pm"].created_at.year
        yearly_map.setdefault(y, []).append(p["amount"])
    yearly_breakdown = [
        schemas.RevenueByMonth(year=y, month=0, total=sum(vals), count=len(vals))
        for y, vals in sorted(yearly_map.items())
    ]

    # By venue
    venue_map: dict[int, dict] = {}
    for p in all_payments:
        vid = p["pm"].venue_id
        if vid not in venue_map:
            venue_map[vid] = {"name": p["venue"].name if p["venue"] else f"#{vid}", "total": 0.0, "count": 0}
        if p["pm"].status == "paid":
            venue_map[vid]["total"] += p["amount"]
            venue_map[vid]["count"] += 1
    by_venue = [
        schemas.RevenueByVenue(venueId=vid, venueName=d["name"], total=d["total"], count=d["count"])
        for vid, d in sorted(venue_map.items(), key=lambda x: x[1]["total"], reverse=True)
    ]

    # By tariff
    tariff_map: dict[int, dict] = {}
    for p in all_payments:
        tid = p["plan"].id if p["plan"] else 0
        if tid not in tariff_map:
            tariff_map[tid] = {"name": p["plan"].name if p["plan"] else "Noma'lum", "total": 0.0, "count": 0}
        if p["pm"].status == "paid":
            tariff_map[tid]["total"] += p["amount"]
            tariff_map[tid]["count"] += 1
    by_tariff = [
        schemas.RevenueByTariff(tariffPlanId=tid, tariffName=d["name"], total=d["total"], count=d["count"])
        for tid, d in sorted(tariff_map.items(), key=lambda x: x[1]["total"], reverse=True)
    ]

    return schemas.OwnerReport(
        totalRevenue=float(total_revenue),
        totalPayments=len(all_payments),
        paidCount=paid_count,
        pendingCount=pending_count,
        failedCount=failed_count,
        dailyBreakdown=daily_breakdown,
        monthlyBreakdown=monthly_breakdown,
        yearlyBreakdown=yearly_breakdown,
        byVenue=by_venue,
        byTariff=by_tariff,
    )


@app.get(
    "/api/venues/{venueId}/rooms",
    response_model=list[schemas.Room],
    tags=["rooms"],
)
async def list_rooms(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.Room]:
    _require_venue_access(current_user, venueId)
    rooms = db.scalars(select(models.Room).where(models.Room.venue_id == venueId)).all()
    return [_room_to_schema(r) for r in rooms]


@app.post(
    "/api/venues/{venueId}/rooms",
    response_model=schemas.Room,
    status_code=status.HTTP_201_CREATED,
    tags=["rooms"],
)
async def create_room(
    venueId: int,
    payload: schemas.RoomInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.Room:
    _require_venue_access(current_user, venueId)
    r = models.Room(
        venue_id=venueId,
        name=payload.name,
        description=payload.description,
        is_active=True,
    )
    db.add(r)
    db.flush()
    db.refresh(r)
    return _room_to_schema(r)


@app.patch(
    "/api/venues/{venueId}/rooms/{id}",
    response_model=schemas.Room,
    tags=["rooms"],
)
async def update_room(
    venueId: int,
    id: int,
    payload: schemas.RoomUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.Room:
    _require_venue_access(current_user, venueId)
    r = db.get(models.Room, id)
    if not r or r.venue_id != venueId:
        raise HTTPException(status_code=404, detail="Room not found")
    patch = payload.model_dump(exclude_unset=True)
    if "isActive" in patch:
        patch["is_active"] = patch.pop("isActive")
    for k, val in patch.items():
        setattr(r, k, val)
    db.add(r)
    db.flush()
    db.refresh(r)
    return _room_to_schema(r)


@app.delete(
    "/api/venues/{venueId}/rooms/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["rooms"],
)
async def delete_room(
    venueId: int,
    id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> Response:
    _require_venue_access(current_user, venueId)
    r = db.get(models.Room, id)
    if not r or r.venue_id != venueId:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.delete(r)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/api/venues/{venueId}/tables",
    response_model=list[schemas.Table],
    tags=["rooms"],
)
async def list_tables(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.Table]:
    _require_venue_access(current_user, venueId)
    tables = db.scalars(select(models.Table).where(models.Table.venue_id == venueId)).all()
    return [_table_to_schema(t) for t in tables]


@app.get(
    "/api/venues/{venueId}/occupied-tables",
    response_model=list[int],
    tags=["rooms"],
)
async def list_occupied_tables(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[int]:
    """Band (egallangan) stollar IDlari ro'yxati: hali afitsiant yopmagan buyurtmalar bo'lgan stollar."""
    _require_venue_access(current_user, venueId)
    rows = db.execute(
        select(models.Order.table_id).where(
            models.Order.venue_id == venueId,
            models.Order.waiter_closed == False,
            models.Order.status.in_(["open", "preparing", "ready"]),
            models.Order.table_id.isnot(None),
        ).distinct()
    ).all()
    return [r[0] for r in rows if r[0] is not None]


@app.post(
    "/api/venues/{venueId}/tables",
    response_model=schemas.Table,
    status_code=status.HTTP_201_CREATED,
    tags=["rooms"],
)
async def create_table(
    venueId: int,
    payload: schemas.TableInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.Table:
    _require_venue_access(current_user, venueId)
    t = models.Table(
        venue_id=venueId,
        room_id=payload.roomId,
        number=payload.number,
        name=payload.name,
        capacity=payload.capacity,
        is_active=True,
    )
    db.add(t)
    db.flush()
    db.refresh(t)
    return _table_to_schema(t)


@app.patch(
    "/api/venues/{venueId}/tables/{id}",
    response_model=schemas.Table,
    tags=["rooms"],
)
async def update_table(
    venueId: int,
    id: int,
    payload: schemas.TableUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.Table:
    _require_venue_access(current_user, venueId)
    t = db.get(models.Table, id)
    if not t or t.venue_id != venueId:
        raise HTTPException(status_code=404, detail="Table not found")
    patch = payload.model_dump(exclude_unset=True)
    if "isActive" in patch:
        patch["is_active"] = patch.pop("isActive")
    for k, val in patch.items():
        setattr(t, k, val)
    db.add(t)
    db.flush()
    db.refresh(t)
    return _table_to_schema(t)


@app.delete(
    "/api/venues/{venueId}/tables/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["rooms"],
)
async def delete_table(
    venueId: int,
    id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> Response:
    _require_venue_access(current_user, venueId)
    t = db.get(models.Table, id)
    if not t or t.venue_id != venueId:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.delete(t)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/api/venues/{venueId}/room-bookings",
    response_model=list[schemas.RoomBooking],
    tags=["rooms"],
)
async def list_room_bookings(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.RoomBooking]:
    _require_venue_access(current_user, venueId)
    bookings = db.scalars(
        select(models.RoomBooking)
        .where(models.RoomBooking.venue_id == venueId)
        .order_by(models.RoomBooking.start_at.asc(), models.RoomBooking.id.desc())
    ).all()
    return [_booking_to_schema(b) for b in bookings]


@app.post(
    "/api/venues/{venueId}/room-bookings",
    response_model=schemas.RoomBooking,
    status_code=status.HTTP_201_CREATED,
    tags=["rooms"],
)
async def create_room_booking(
    venueId: int,
    payload: schemas.RoomBookingInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.RoomBooking:
    _require_venue_access(current_user, venueId)
    if payload.endAt <= payload.startAt:
        raise HTTPException(status_code=422, detail="endAt must be after startAt")
    room = db.get(models.Room, payload.roomId)
    if not room or room.venue_id != venueId:
        raise HTTPException(status_code=404, detail="Room not found")
    if payload.tableId:
        table = db.get(models.Table, payload.tableId)
        if not table or table.venue_id != venueId:
            raise HTTPException(status_code=404, detail="Table not found")
        if table.room_id and table.room_id != payload.roomId:
            raise HTTPException(status_code=422, detail="Table does not belong to selected room")

    # Check for overlapping active booking on same table/room
    overlap_conditions = [
        models.RoomBooking.venue_id == venueId,
        models.RoomBooking.status == "active",
        models.RoomBooking.start_at < payload.endAt,
        models.RoomBooking.end_at > payload.startAt,
    ]
    if payload.tableId:
        # Check table-level overlap
        overlap_conditions.append(models.RoomBooking.table_id == payload.tableId)
        overlap = db.scalar(select(models.RoomBooking).where(*overlap_conditions).limit(1))
        if overlap:
            raise HTTPException(
                status_code=409,
                detail=f"Bu stol/xona ga {overlap.start_at.isoformat()}-{overlap.end_at.isoformat()} oralig'ida bron mavjud ({overlap.customer_name})",
            )
        # Also check room-level booking on this table's room
        table = db.get(models.Table, payload.tableId)
        if table and table.room_id:
            room_overlap = db.scalar(
                select(models.RoomBooking)
                .where(
                    models.RoomBooking.venue_id == venueId,
                    models.RoomBooking.room_id == payload.roomId,
                    models.RoomBooking.table_id.is_(None),
                    models.RoomBooking.status == "active",
                    models.RoomBooking.start_at < payload.endAt,
                    models.RoomBooking.end_at > payload.startAt,
                )
                .limit(1)
            )
            if room_overlap:
                raise HTTPException(
                    status_code=409,
                    detail=f"Bu xona (#{payload.roomId}) ga bron qilingan ({room_overlap.customer_name})",
                )
    else:
        # Room-level booking: check any active booking in the room (table-level or room-level)
        overlap = db.scalar(select(models.RoomBooking).where(*overlap_conditions).limit(1))
        if overlap:
            raise HTTPException(
                status_code=409,
                detail=f"Bu xona (#{payload.roomId}) ga {overlap.start_at.isoformat()}-{overlap.end_at.isoformat()} oralig'ida bron mavjud ({overlap.customer_name})",
            )

    b = models.RoomBooking(
        venue_id=venueId,
        room_id=payload.roomId,
        table_id=payload.tableId,
        customer_name=payload.customerName.strip(),
        customer_phone=payload.customerPhone,
        start_at=payload.startAt,
        end_at=payload.endAt,
        notes=payload.notes,
        status="active",
    )
    db.add(b)
    db.flush()
    db.refresh(b)
    return _booking_to_schema(b)


@app.patch(
    "/api/venues/{venueId}/room-bookings/{id}",
    response_model=schemas.RoomBooking,
    tags=["rooms"],
)
async def update_room_booking(
    venueId: int,
    id: int,
    payload: schemas.RoomBookingUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.RoomBooking:
    _require_venue_access(current_user, venueId)
    b = db.get(models.RoomBooking, id)
    if not b or b.venue_id != venueId:
        raise HTTPException(status_code=404, detail="Booking not found")

    patch = payload.model_dump(exclude_unset=True)
    if "customerName" in patch and patch["customerName"] is not None:
        patch["customer_name"] = patch.pop("customerName").strip()
    if "customerPhone" in patch:
        patch["customer_phone"] = patch.pop("customerPhone")
    if "startAt" in patch:
        patch["start_at"] = patch.pop("startAt")
    if "endAt" in patch:
        patch["end_at"] = patch.pop("endAt")
    for k, val in patch.items():
        setattr(b, k, val)
    if b.end_at <= b.start_at:
        raise HTTPException(status_code=422, detail="endAt must be after startAt")
    db.add(b)
    db.flush()
    db.refresh(b)
    return _booking_to_schema(b)


@app.delete(
    "/api/venues/{venueId}/room-bookings/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["rooms"],
)
async def delete_room_booking(
    venueId: int,
    id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> Response:
    _require_venue_access(current_user, venueId)
    b = db.get(models.RoomBooking, id)
    if not b or b.venue_id != venueId:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.delete(b)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/users", response_model=list[schemas.User], tags=["auth"])
async def list_users(
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> list[schemas.User]:
    users = db.scalars(select(models.User).order_by(models.User.id.asc())).all()
    return [_user_to_schema(db, u) for u in users]


@app.post(
    "/api/users",
    response_model=schemas.User,
    status_code=status.HTTP_201_CREATED,
    tags=["auth"],
)
async def create_user(
    payload: schemas.UserInput,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.User:
    existing = db.scalar(select(models.User).where(models.User.username == payload.username))
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")
    u = models.User(
        username=payload.username,
        password_hash=auth.hash_password(payload.password),
        name=payload.name,
        phone=payload.phone,
        role=payload.role,
        venue_id=payload.venueId,
    )
    db.add(u)
    db.flush()
    db.refresh(u)
    return _user_to_schema(db, u)


@app.put(
    "/api/users/{userId}",
    response_model=schemas.User,
    tags=["auth"],
)
async def update_user(
    userId: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> schemas.User:
    u = db.get(models.User, userId)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.username is not None:
        existing = db.scalar(select(models.User).where(models.User.username == payload.username, models.User.id != userId))
        if existing:
            raise HTTPException(status_code=409, detail="Username already exists")
        u.username = payload.username
    if payload.password is not None:
        u.password_hash = auth.hash_password(payload.password)
    if payload.name is not None:
        u.name = payload.name
    if payload.phone is not None:
        u.phone = payload.phone
    if payload.role is not None:
        u.role = payload.role
    if payload.venueId is not None:
        u.venue_id = payload.venueId
    db.flush()
    db.refresh(u)
    return _user_to_schema(db, u)


@app.delete(
    "/api/users/{userId}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["auth"],
)
async def delete_user(
    userId: int,
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.require_role("owner")),
) -> Response:
    u = db.get(models.User, userId)
    if not u:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    if u.role == "owner":
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.delete(u)
    db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Public menu endpoints (no auth) ---

@app.get(
    "/api/public/venues/{venueId}",
    response_model=schemas.PublicVenue,
    tags=["public"],
)
async def public_get_venue(
    venueId: int,
    db: Session = Depends(get_db),
) -> schemas.PublicVenue:
    v = db.get(models.Venue, venueId)
    if not v:
        raise HTTPException(status_code=404, detail="Venue not found")
    return schemas.PublicVenue(
        id=v.id,
        name=v.name,
        type=v.type,
        logoUrl=v.logo_url,
        address=v.address,
        phone=v.phone,
        instagram=v.instagram,
        telegram=v.telegram,
        facebook=v.facebook,
        latitude=float(v.latitude) if v.latitude is not None else None,
        longitude=float(v.longitude) if v.longitude is not None else None,
    )


@app.get(
    "/api/public/venues/{venueId}/menu",
    response_model=schemas.PublicMenu,
    tags=["public"],
)
async def public_get_menu(
    venueId: int,
    db: Session = Depends(get_db),
) -> schemas.PublicMenu:
    v = db.get(models.Venue, venueId)
    if not v:
        raise HTTPException(status_code=404, detail="Venue not found")
    products = db.scalars(
        select(models.Product)
        .where(models.Product.venue_id == venueId, models.Product.is_available == True)
        .order_by(models.Product.category, models.Product.name)
    ).all()
    return schemas.PublicMenu(
        venue=schemas.PublicVenue(
            id=v.id,
            name=v.name,
            type=v.type,
            address=v.address,
            phone=v.phone,
            instagram=v.instagram,
            telegram=v.telegram,
            facebook=v.facebook,
        ),
        products=[
            schemas.PublicProduct(
                id=p.id,
                name=p.name,
                price=float(p.price),
                category=p.category,
                description=p.description,
                imageUrl=p.image_url,
            )
            for p in products
        ],
    )


@app.get(
    "/api/public/menu/by-name/{venueName}",
    response_model=schemas.PublicMenu,
    tags=["public"],
)
async def public_get_menu_by_name(
    venueName: str,
    db: Session = Depends(get_db),
) -> schemas.PublicMenu:
    v = db.scalar(select(models.Venue).where(models.Venue.name == venueName))
    if not v:
        raise HTTPException(status_code=404, detail="Venue not found")
    return await _build_public_menu(db, v)


@app.get(
    "/api/public/menu/by-id/{venueId}",
    response_model=schemas.PublicMenu,
    tags=["public"],
)
async def public_get_menu_by_id(
    venueId: int,
    db: Session = Depends(get_db),
) -> schemas.PublicMenu:
    v = db.get(models.Venue, venueId)
    if not v:
        raise HTTPException(status_code=404, detail="Venue not found")
    return await _build_public_menu(db, v)


async def _build_public_menu(db: Session, v: models.Venue) -> schemas.PublicMenu:
    products = db.scalars(
        select(models.Product)
        .where(models.Product.venue_id == v.id, models.Product.is_available == True)
        .order_by(models.Product.category, models.Product.name)
    ).all()
    # Omborxonadagi tayyor mahsulotlar (direct items)
    direct_items = db.scalars(
        select(models.InventoryItem)
        .where(
            models.InventoryItem.venue_id == v.id,
            models.InventoryItem.item_type == "direct",
            models.InventoryItem.quantity > 0,
            models.InventoryItem.sell_price > 0,
        )
        .order_by(models.InventoryItem.category, models.InventoryItem.name)
    ).all()
    # Mahsulotlar va tayyor mahsulotlarni bir ro'yxatga jamlash
    existing_names = {p.name.lower() for p in products}
    public_products = [
        schemas.PublicProduct(
            id=p.id,
            name=p.name,
            price=float(p.price),
            category=p.category,
            description=p.description,
            imageUrl=p.image_url,
        )
        for p in products
    ]
    for d in direct_items:
        if d.name.lower() in existing_names:
            continue
        public_products.append(schemas.PublicProduct(
            id=d.id + 100000,  # ID to'qnashuvini oldini olish
            name=d.name,
            price=float(d.sell_price),
            category=d.category or "Tayyor mahsulot",
            description=None,
            imageUrl=d.image_url,
        ))

    return schemas.PublicMenu(
        venue=schemas.PublicVenue(
            id=v.id,
            name=v.name,
            type=v.type,
            logoUrl=v.logo_url,
            address=v.address,
            phone=v.phone,
            instagram=v.instagram,
            telegram=v.telegram,
            facebook=v.facebook,
            latitude=float(v.latitude) if v.latitude is not None else None,
            longitude=float(v.longitude) if v.longitude is not None else None,
        ),
        products=public_products,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)



# ============================================================================
# INVENTORY (Omborxona) ENDPOINTS
# ============================================================================


def _inv_item_to_schema(item: models.InventoryItem) -> schemas.InventoryItem:
    return schemas.InventoryItem(
        id=item.id,
        venueId=item.venue_id,
        name=item.name,
        category=item.category,
        itemType=item.item_type,
        imageUrl=item.image_url,
        unit=item.unit,
        packUnit=item.pack_unit,
        packSize=float(item.pack_size),
        quantity=float(item.quantity),
        minQuantity=float(item.min_quantity),
        costPrice=float(item.cost_price),
        sellPrice=float(item.sell_price),
        createdAt=item.created_at,
    )


@app.get(
    "/api/venues/{venueId}/inventory",
    response_model=list[schemas.InventoryItem],
    tags=["inventory"],
)
async def list_inventory(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.InventoryItem]:
    _require_venue_access(current_user, venueId)
    items = db.scalars(
        select(models.InventoryItem)
        .where(models.InventoryItem.venue_id == venueId)
        .order_by(models.InventoryItem.name.asc())
    ).all()
    return [_inv_item_to_schema(i) for i in items]


@app.post(
    "/api/venues/{venueId}/inventory",
    response_model=schemas.InventoryItem,
    status_code=status.HTTP_201_CREATED,
    tags=["inventory"],
)
async def create_inventory_item(
    venueId: int,
    payload: schemas.InventoryItemInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.InventoryItem:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    item = models.InventoryItem(
        venue_id=venueId,
        name=payload.name,
        category=payload.category,
        item_type=payload.itemType,
        image_url=payload.imageUrl,
        unit=payload.unit,
        pack_unit=payload.packUnit,
        pack_size=payload.packSize,
        quantity=payload.quantity,
        min_quantity=payload.minQuantity,
        cost_price=payload.costPrice,
        sell_price=payload.sellPrice,
    )
    db.add(item)
    db.flush()
    db.refresh(item)

    # Agar mahsulot turi "direct" bo'lsa, mos Product ham yaratamiz (kassada/menyuda sotish uchun)
    if item.item_type == "direct":
        existing_product = db.scalar(
            select(models.Product).where(
                models.Product.venue_id == venueId,
                models.Product.name == item.name,
            )
        )
        if not existing_product:
            db.add(models.Product(
                venue_id=venueId,
                name=item.name,
                price=float(item.sell_price),
                category=item.category or "Tayyor mahsulot",
                image_url=item.image_url,
                stock=int(float(item.quantity)) if float(item.quantity) > 0 else None,
                is_available=True,
            ))
            db.flush()

    # Boshlang'ich miqdor > 0 bo'lsa, avtomatik kirim tranzaksiyasi yaratish (xarajatga qo'shilishi uchun)
    if float(item.quantity) > 0 and float(item.cost_price) > 0:
        pack_size = float(item.pack_size) if item.pack_size and float(item.pack_size) > 0 else 1
        tx_qty = float(item.quantity) / pack_size  # paket birligiga o'tkazamiz
        db.add(models.InventoryTransaction(
            venue_id=venueId,
            item_id=item.id,
            type="in",
            quantity=tx_qty,
            note=f"Boshlang'ich kirim: {item.name}",
            created_by=current_user.id,
        ))
        db.flush()

    return _inv_item_to_schema(item)


@app.patch(
    "/api/venues/{venueId}/inventory/{itemId}",
    response_model=schemas.InventoryItem,
    tags=["inventory"],
)
async def update_inventory_item(
    venueId: int,
    itemId: int,
    payload: schemas.InventoryItemUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.InventoryItem:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    item = db.get(models.InventoryItem, itemId)
    if not item or item.venue_id != venueId:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    patch = payload.model_dump(exclude_unset=True)
    field_map = {"minQuantity": "min_quantity", "costPrice": "cost_price", "sellPrice": "sell_price", "itemType": "item_type", "packUnit": "pack_unit", "packSize": "pack_size", "imageUrl": "image_url"}
    old_qty = float(item.quantity)
    for k, val in patch.items():
        if k == "quantity":
            continue  # quantity ni keyin alohida ishlaymiz
        setattr(item, field_map.get(k, k), val)
    # Quantity o'zgargan bo'lsa, farqni tranzaksiya sifatida yozamiz
    if "quantity" in patch:
        new_qty = float(patch["quantity"])
        diff = new_qty - old_qty
        if diff != 0:
            if diff < 0 and float(item.quantity) < abs(diff):
                raise HTTPException(status_code=422, detail="Yetarli miqdor yo'q")
            item.quantity = new_qty
            tx_type = "in" if diff > 0 else "out"
            pack_size = float(item.pack_size) if item.pack_size and float(item.pack_size) > 0 else 1
            if tx_type == "in":
                tx_qty = diff / pack_size  # paket birligida
            else:
                tx_qty = abs(diff)  # sotuv birligida
            db.add(models.InventoryTransaction(
                venue_id=venueId,
                item_id=item.id,
                type=tx_type,
                quantity=tx_qty,
                note=f"Tahrirlash: miqdor {old_qty:.0f} → {new_qty:.0f} {item.unit}",
                created_by=current_user.id,
            ))
    # Direct mahsulot bo'lsa, Product yozuvini ham yangilaymiz
    if item.item_type == "direct":
        existing_product = db.scalar(
            select(models.Product).where(
                models.Product.venue_id == venueId,
                models.Product.name == item.name,
            )
        )
        if existing_product:
            if "category" in patch:
                existing_product.category = item.category or "Tayyor mahsulot"
            if "sellPrice" in patch:
                existing_product.price = float(item.sell_price)
            if "quantity" in patch:
                existing_product.stock = int(new_qty) if new_qty > 0 else None
            if "imageUrl" in patch:
                existing_product.image_url = item.image_url
        elif float(item.sell_price) > 0:
            # Product hali yaratilmagan bo'lsa, yangidan yaratamiz
            db.add(models.Product(
                venue_id=venueId,
                name=item.name,
                price=float(item.sell_price),
                category=item.category or "Tayyor mahsulot",
                image_url=item.image_url,
                stock=int(float(item.quantity)) if float(item.quantity) > 0 else None,
                is_available=True,
            ))
    db.flush()
    db.refresh(item)
    return _inv_item_to_schema(item)


@app.delete(
    "/api/venues/{venueId}/inventory/{itemId}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["inventory"],
)
async def delete_inventory_item(
    venueId: int,
    itemId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> Response:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    item = db.get(models.InventoryItem, itemId)
    if not item or item.venue_id != venueId:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.delete(item)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post(
    "/api/venues/{venueId}/inventory/transaction",
    response_model=schemas.InventoryTransaction,
    status_code=status.HTTP_201_CREATED,
    tags=["inventory"],
)
async def create_inventory_transaction(
    venueId: int,
    payload: schemas.InventoryTransactionInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.InventoryTransaction:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    item = db.get(models.InventoryItem, payload.itemId)
    if not item or item.venue_id != venueId:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    # Update quantity (kirimda pack_size hisobga olinadi)
    if payload.type == "in":
        actual_qty = payload.quantity * float(item.pack_size)
        item.quantity = float(item.quantity) + actual_qty
    else:
        if float(item.quantity) < payload.quantity:
            raise HTTPException(status_code=422, detail="Yetarli miqdor yo'q")
        item.quantity = float(item.quantity) - payload.quantity
    tx = models.InventoryTransaction(
        venue_id=venueId,
        item_id=payload.itemId,
        type=payload.type,
        quantity=payload.quantity,
        note=payload.note,
        created_by=current_user.id,
    )
    db.add(tx)
    db.flush()
    db.refresh(tx)
    db.refresh(item)
    return schemas.InventoryTransaction(
        id=tx.id,
        venueId=tx.venue_id,
        itemId=tx.item_id,
        itemName=item.name,
        type=tx.type,  # type: ignore[arg-type]
        quantity=float(tx.quantity),
        note=tx.note,
        createdBy=tx.created_by,
        createdByName=current_user.name or current_user.username,
        createdAt=tx.created_at,
    )


@app.get(
    "/api/venues/{venueId}/inventory/transactions",
    response_model=list[schemas.InventoryTransaction],
    tags=["inventory"],
)
async def list_inventory_transactions(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.InventoryTransaction]:
    _require_venue_access(current_user, venueId)
    txs = db.scalars(
        select(models.InventoryTransaction)
        .where(models.InventoryTransaction.venue_id == venueId)
        .order_by(models.InventoryTransaction.id.desc())
        .limit(500)
    ).all()
    result: list[schemas.InventoryTransaction] = []
    for tx in txs:
        item = db.get(models.InventoryItem, tx.item_id)
        creator_name = None
        if tx.created_by:
            creator = db.get(models.User, tx.created_by)
            creator_name = (creator.name or creator.username) if creator else None
        result.append(schemas.InventoryTransaction(
            id=tx.id,
            venueId=tx.venue_id,
            itemId=tx.item_id,
            itemName=item.name if item else None,
            type=tx.type,  # type: ignore[arg-type]
            quantity=float(tx.quantity),
            note=tx.note,
            createdBy=tx.created_by,
            createdByName=creator_name,
            createdAt=tx.created_at,
        ))
    return result


@app.get(
    "/api/venues/{venueId}/inventory/alerts",
    response_model=list[schemas.InventoryAlert],
    tags=["inventory"],
)
async def list_inventory_alerts(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.InventoryAlert]:
    _require_venue_access(current_user, venueId)
    items = db.scalars(
        select(models.InventoryItem)
        .where(
            models.InventoryItem.venue_id == venueId,
            models.InventoryItem.quantity <= models.InventoryItem.min_quantity,
            models.InventoryItem.min_quantity > 0,
        )
    ).all()
    return [
        schemas.InventoryAlert(
            id=i.id,
            name=i.name,
            unit=i.unit,
            quantity=float(i.quantity),
            minQuantity=float(i.min_quantity),
        )
        for i in items
    ]


# ============================================================================
# VENUE SETTINGS (Funksiyalar) ENDPOINTS
# ============================================================================

SETTINGS_FIELD_MAP = {
    "receiptQrEnabled": "receipt_qr_enabled",
    "receiptLogoEnabled": "receipt_logo_enabled",
    "onlineOrdersEnabled": "online_orders_enabled",
    "kassirCancelReceipt": "kassir_cancel_receipt",
    "kassirGiveDiscount": "kassir_give_discount",
    "roomBookingEnabled": "room_booking_enabled",
    "waiterCancelOrder": "waiter_cancel_order",
    "waiterGiveDiscount": "waiter_give_discount",
    "kitchenAutoAccept": "kitchen_auto_accept",
    "inventoryLowAlert": "inventory_low_alert",
}


def _get_or_create_settings(db: Session, venue_id: int) -> models.VenueSettings:
    s = db.scalar(select(models.VenueSettings).where(models.VenueSettings.venue_id == venue_id))
    if s is None:
        s = models.VenueSettings(venue_id=venue_id)
        db.add(s)
        db.flush()
        db.refresh(s)
    return s


def _require_setting_enabled(db: Session, venue_id: int, schema_key: str) -> None:
    """Berilgan funksiya sozlamada yoqilganligini tekshirish.
    Agar o'chirilgan bo'lsa HTTP 403 qaytaradi.
    schema_key — camelCase kalit (masalan 'onlineOrdersEnabled').
    """
    s = _get_or_create_settings(db, venue_id)
    db_key = SETTINGS_FIELD_MAP.get(schema_key)
    if db_key is None:
        return
    enabled = getattr(s, db_key, None)
    if enabled is False:
        raise HTTPException(status_code=403, detail=f"Bu funksiya o'chirilgan: {schema_key}")


def _settings_to_schema(s: models.VenueSettings) -> schemas.VenueSettingsSchema:
    return schemas.VenueSettingsSchema(
        receiptQrEnabled=s.receipt_qr_enabled,
        receiptLogoEnabled=s.receipt_logo_enabled,
        onlineOrdersEnabled=s.online_orders_enabled,
        kassirCancelReceipt=s.kassir_cancel_receipt,
        kassirGiveDiscount=s.kassir_give_discount,
        roomBookingEnabled=s.room_booking_enabled,
        waiterCancelOrder=s.waiter_cancel_order,
        waiterGiveDiscount=s.waiter_give_discount,
        kitchenAutoAccept=s.kitchen_auto_accept,
        inventoryLowAlert=s.inventory_low_alert,
    )


@app.get(
    "/api/venues/{venueId}/settings",
    response_model=schemas.VenueSettingsSchema,
    tags=["settings"],
)
async def get_venue_settings(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.VenueSettingsSchema:
    _require_venue_access(current_user, venueId)
    s = _get_or_create_settings(db, venueId)
    return _settings_to_schema(s)


@app.patch(
    "/api/venues/{venueId}/settings",
    response_model=schemas.VenueSettingsSchema,
    tags=["settings"],
)
async def update_venue_settings(
    venueId: int,
    payload: schemas.VenueSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.VenueSettingsSchema:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    s = _get_or_create_settings(db, venueId)
    patch = payload.model_dump(exclude_unset=True)
    for schema_key, val in patch.items():
        db_key = SETTINGS_FIELD_MAP.get(schema_key, schema_key)
        setattr(s, db_key, val)
    db.flush()
    db.refresh(s)
    return _settings_to_schema(s)


# ============================================================================
# EXPENSES (Xarajatlar) & FINANCE ENDPOINTS
# ============================================================================


@app.get(
    "/api/venues/{venueId}/expenses",
    response_model=list[schemas.ExpenseSchema],
    tags=["finance"],
)
async def list_expenses(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.ExpenseSchema]:
    _require_venue_access(current_user, venueId)
    expenses = db.scalars(
        select(models.Expense)
        .where(models.Expense.venue_id == venueId)
        .order_by(models.Expense.date.desc())
        .limit(500)
    ).all()
    return [
        schemas.ExpenseSchema(
            id=e.id, venueId=e.venue_id, category=e.category,
            amount=float(e.amount), description=e.description,
            date=e.date, createdBy=e.created_by, createdAt=e.created_at,
        )
        for e in expenses
    ]


@app.post(
    "/api/venues/{venueId}/expenses",
    response_model=schemas.ExpenseSchema,
    status_code=status.HTTP_201_CREATED,
    tags=["finance"],
)
async def create_expense(
    venueId: int,
    payload: schemas.ExpenseInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.ExpenseSchema:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    expense_date = datetime.fromisoformat(payload.date) if payload.date else _now_utc()
    e = models.Expense(
        venue_id=venueId,
        category=payload.category,
        amount=payload.amount,
        description=payload.description,
        date=expense_date,
        created_by=current_user.id,
    )
    db.add(e)
    db.flush()
    db.refresh(e)
    return schemas.ExpenseSchema(
        id=e.id, venueId=e.venue_id, category=e.category,
        amount=float(e.amount), description=e.description,
        date=e.date, createdBy=e.created_by, createdAt=e.created_at,
    )


@app.delete(
    "/api/venues/{venueId}/expenses/{expenseId}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["finance"],
)
async def delete_expense(
    venueId: int,
    expenseId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> Response:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    e = db.get(models.Expense, expenseId)
    if not e or e.venue_id != venueId:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.delete(e)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/api/venues/{venueId}/finance/summary",
    response_model=schemas.FinanceSummary,
    tags=["finance"],
)
async def get_finance_summary(
    venueId: int,
    period: str = "month",  # day|month|year|all
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.FinanceSummary:
    _require_venue_access(current_user, venueId)
    now = _now_utc()
    start = None
    if period == "day":
        start = datetime(now.year, now.month, now.day, tzinfo=now.tzinfo)
        label = now.strftime("%d.%m.%Y")
    elif period == "year":
        start = datetime(now.year, 1, 1, tzinfo=now.tzinfo)
        label = str(now.year)
    elif period == "all":
        label = "Barcha vaqt"
    else:
        start = datetime(now.year, now.month, 1, tzinfo=now.tzinfo)
        label = now.strftime("%m/%Y")

    rev_q = select(func.coalesce(func.sum(models.Order.total_amount), 0)).where(
        models.Order.venue_id == venueId, models.Order.status.in_(["completed", "debt"]))
    exp_q = select(func.coalesce(func.sum(models.Expense.amount), 0)).where(
        models.Expense.venue_id == venueId)
    inv_q = select(models.InventoryTransaction).where(
        models.InventoryTransaction.venue_id == venueId, models.InventoryTransaction.type == "in")
    if start:
        rev_q = rev_q.where(models.Order.created_at >= start)
        exp_q = exp_q.where(models.Expense.date >= start)
        inv_q = inv_q.where(models.InventoryTransaction.created_at >= start)

    revenue = float(db.scalar(rev_q) or 0)
    manual_expenses = float(db.scalar(exp_q) or 0)
    # Mahsulot xaridlari (ombor kirimi * tan narx)
    inv_txs = db.scalars(inv_q).all()
    product_expenses = 0.0
    for tx in inv_txs:
        item = db.get(models.InventoryItem, tx.item_id)
        if item:
            pack_size = float(item.pack_size) if item.pack_size and float(item.pack_size) > 0 else 1
            product_expenses += float(tx.quantity) * pack_size * float(item.cost_price)
    expenses = manual_expenses + product_expenses
    return schemas.FinanceSummary(
        totalRevenue=revenue, totalExpenses=expenses,
        netProfit=revenue - expenses, periodLabel=label,
    )


@app.get(
    "/api/venues/{venueId}/finance/chart",
    response_model=list[schemas.FinanceChartPoint],
    tags=["finance"],
)
async def get_finance_chart(
    venueId: int,
    period: str = "month",  # day|month|year
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.FinanceChartPoint]:
    _require_venue_access(current_user, venueId)
    now = _now_utc()
    points: list[schemas.FinanceChartPoint] = []

    if period == "day":
        # Oxirgi 24 soat — soatlik
        for h in range(24):
            hour_start = datetime(now.year, now.month, now.day, h, tzinfo=now.tzinfo)
            hour_end = datetime(now.year, now.month, now.day, h, 59, 59, tzinfo=now.tzinfo)
            rev = float(db.scalar(
                select(func.coalesce(func.sum(models.Order.total_amount), 0))
                .where(models.Order.venue_id == venueId, models.Order.status.in_(["completed", "debt"]),
                       models.Order.created_at >= hour_start, models.Order.created_at <= hour_end)
            ) or 0)
            exp = float(db.scalar(
                select(func.coalesce(func.sum(models.Expense.amount), 0))
                .where(models.Expense.venue_id == venueId,
                       models.Expense.date >= hour_start, models.Expense.date <= hour_end)
            ) or 0)
            points.append(schemas.FinanceChartPoint(
                label=f"{h:02d}:00", revenue=rev, expenses=exp, profit=rev - exp,
            ))
    elif period == "year":
        # 12 oy
        for m in range(1, 13):
            m_start = datetime(now.year, m, 1, tzinfo=now.tzinfo)
            if m < 12:
                m_end = datetime(now.year, m + 1, 1, tzinfo=now.tzinfo)
            else:
                m_end = datetime(now.year + 1, 1, 1, tzinfo=now.tzinfo)
            rev = float(db.scalar(
                select(func.coalesce(func.sum(models.Order.total_amount), 0))
                .where(models.Order.venue_id == venueId, models.Order.status.in_(["completed", "debt"]),
                       models.Order.created_at >= m_start, models.Order.created_at < m_end)
            ) or 0)
            exp = float(db.scalar(
                select(func.coalesce(func.sum(models.Expense.amount), 0))
                .where(models.Expense.venue_id == venueId,
                       models.Expense.date >= m_start, models.Expense.date < m_end)
            ) or 0)
            month_names = ["Yan", "Fev", "Mar", "Apr", "May", "Iyun", "Iyul", "Avg", "Sen", "Okt", "Noy", "Dek"]
            points.append(schemas.FinanceChartPoint(
                label=month_names[m - 1], revenue=rev, expenses=exp, profit=rev - exp,
            ))
    else:
        # Oylik — kunlik
        import calendar
        days_in_month = calendar.monthrange(now.year, now.month)[1]
        for d in range(1, days_in_month + 1):
            d_start = datetime(now.year, now.month, d, tzinfo=now.tzinfo)
            d_end = datetime(now.year, now.month, d, 23, 59, 59, tzinfo=now.tzinfo)
            rev = float(db.scalar(
                select(func.coalesce(func.sum(models.Order.total_amount), 0))
                .where(models.Order.venue_id == venueId, models.Order.status.in_(["completed", "debt"]),
                       models.Order.created_at >= d_start, models.Order.created_at <= d_end)
            ) or 0)
            exp = float(db.scalar(
                select(func.coalesce(func.sum(models.Expense.amount), 0))
                .where(models.Expense.venue_id == venueId,
                       models.Expense.date >= d_start, models.Expense.date <= d_end)
            ) or 0)
            points.append(schemas.FinanceChartPoint(
                label=str(d), revenue=rev, expenses=exp, profit=rev - exp,
            ))

    return points


@app.get(
    "/api/venues/{venueId}/finance/product-expenses",
    tags=["finance"],
)
async def get_product_expenses(
    venueId: int,
    period: str = "month",  # day|month|year|all
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
):
    """Mahsulot xaridlari uchun sarflangan summa (ombor kirimlaridan: quantity * cost_price)."""
    _require_venue_access(current_user, venueId)
    now = _now_utc()
    if period == "all":
        start = None
    elif period == "day":
        start = datetime(now.year, now.month, now.day, tzinfo=now.tzinfo)
    elif period == "year":
        start = datetime(now.year, 1, 1, tzinfo=now.tzinfo)
    else:
        start = datetime(now.year, now.month, 1, tzinfo=now.tzinfo)

    # Kirim tranzaksiyalari (type='in') — har biri uchun quantity * item.cost_price
    query = select(models.InventoryTransaction).where(
        models.InventoryTransaction.venue_id == venueId,
        models.InventoryTransaction.type == "in",
    )
    if start:
        query = query.where(models.InventoryTransaction.created_at >= start)
    query = query.order_by(models.InventoryTransaction.created_at.desc())
    txs = db.scalars(query).all()
    total = 0.0
    details = []
    for tx in txs:
        item = db.get(models.InventoryItem, tx.item_id)
        if item:
            pack_size = float(item.pack_size) if item.pack_size and float(item.pack_size) > 0 else 1
            qty_in_sales_units = float(tx.quantity) * pack_size
            cost = qty_in_sales_units * float(item.cost_price)
            total += cost
            details.append({
                "id": tx.id,
                "itemName": item.name,
                "quantity": qty_in_sales_units,
                "unit": item.unit,
                "costPrice": float(item.cost_price),
                "totalCost": cost,
                "date": tx.created_at.isoformat(),
            })
    return {"total": total, "details": details}


# ============================================================================
# PRODUCT RECIPES & INVENTORY DEDUCTION ON SALE
# ============================================================================


@app.get(
    "/api/venues/{venueId}/products/{productId}/recipe",
    response_model=list[schemas.RecipeItem],
    tags=["inventory"],
)
async def get_product_recipe(
    venueId: int,
    productId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.RecipeItem]:
    _require_venue_access(current_user, venueId)
    recipes = db.scalars(
        select(models.ProductRecipe).where(models.ProductRecipe.product_id == productId)
    ).all()
    result = []
    for r in recipes:
        item = db.get(models.InventoryItem, r.inventory_item_id)
        result.append(schemas.RecipeItem(
            id=r.id,
            inventoryItemId=r.inventory_item_id,
            inventoryItemName=item.name if item else None,
            unit=item.unit if item else None,
            quantity=float(r.quantity),
        ))
    return result


@app.put(
    "/api/venues/{venueId}/products/{productId}/recipe",
    response_model=list[schemas.RecipeItem],
    tags=["inventory"],
)
async def set_product_recipe(
    venueId: int,
    productId: int,
    payload: list[schemas.RecipeItemInput],
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.RecipeItem]:
    """Mahsulot retseptini to'liq o'rnatish (eski retsept o'chiriladi)."""
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    # Mahsulot mavjudligini tekshirish
    product = db.get(models.Product, productId)
    if not product or product.venue_id != venueId:
        raise HTTPException(status_code=404, detail="Product not found")
    # Eski retseptni o'chirish
    old = db.scalars(select(models.ProductRecipe).where(models.ProductRecipe.product_id == productId)).all()
    for o in old:
        db.delete(o)
    db.flush()
    # Yangi retseptni yaratish
    for item_input in payload:
        inv_item = db.get(models.InventoryItem, item_input.inventoryItemId)
        if not inv_item or inv_item.venue_id != venueId:
            raise HTTPException(status_code=404, detail=f"Inventory item {item_input.inventoryItemId} not found")
        db.add(models.ProductRecipe(
            product_id=productId,
            inventory_item_id=item_input.inventoryItemId,
            quantity=item_input.quantity,
        ))
    db.flush()
    # Qaytarish
    return await get_product_recipe(venueId, productId, db, current_user)


def _deduct_inventory_on_sale(db: Session, venue_id: int, order_items: list, reverse: bool = False) -> None:
    """Buyurtma yaratilganda/to'langanda ombordan mahsulotlarni avtomatik kamaytirish.
    - direct tipidagi ombor mahsuloti: to'g'ridan-to'g'ri quantity kamaytiladi
    - ingredient tipidagi: product_recipes orqali har bir ingredient kamaytiladi
    """
    now = datetime.now(timezone.utc)
    for oi in order_items:
        product_id = oi.product_id if hasattr(oi, "product_id") else oi.get("product_id")
        qty_sold = oi.quantity if hasattr(oi, "quantity") else oi.get("quantity", 0)
        if reverse:
            qty_sold = -qty_sold  # storno: omborga qaytarish

        product = db.get(models.Product, product_id)
        if not product:
            continue

        # 1) "direct" ombor mahsulotini tekshirish (product bilan bir xil nomli direct item)
        direct_item = db.scalar(
            select(models.InventoryItem).where(
                models.InventoryItem.venue_id == venue_id,
                models.InventoryItem.item_type == "direct",
                models.InventoryItem.name == product.name,
            )
        )
        if direct_item:
            old_qty = float(direct_item.quantity)
            new_qty = max(0, old_qty - qty_sold)
            direct_item.quantity = new_qty
            db.add(models.InventoryTransaction(
                venue_id=venue_id,
                item_id=direct_item.id,
                type="out",
                quantity=qty_sold,
                note=f"'{product.name}' sotildi ({qty_sold} dona). Qoldiq: {new_qty:.0f} {direct_item.unit}",
                created_at=now,
            ))
            continue

        # 2) Ingredient (retsept bo'yicha)
        recipes = db.scalars(
            select(models.ProductRecipe).where(models.ProductRecipe.product_id == product_id)
        ).all()
        for recipe in recipes:
            inv_item = db.get(models.InventoryItem, recipe.inventory_item_id)
            if inv_item:
                deduct = float(recipe.quantity) * qty_sold
                old_qty = float(inv_item.quantity)
                new_qty = max(0, old_qty - deduct)
                inv_item.quantity = new_qty
                db.add(models.InventoryTransaction(
                    venue_id=venue_id,
                    item_id=inv_item.id,
                    type="out",
                    quantity=deduct,
                    note=f"'{product.name}' ({qty_sold} dona) uchun sarflandi. Qoldiq: {new_qty:.3f} {inv_item.unit}",
                    created_at=now,
                ))


# ============================================================================
# WEB PUSH NOTIFICATIONS
# ============================================================================


def _send_push_notification(db: Session, venue_id: int, title: str, body: str, url: str = "/") -> None:
    """Berilgan venue uchun barcha obuna bo'lgan adminlarga push xabar yuborish."""
    if not settings.VAPID_PUBLIC_KEY:
        return  # VAPID kalitlar sozlanmagan
    try:
        from pywebpush import webpush, WebPushException
        import json as _json
        import os as _os
    except ImportError:
        return

    # PEM faylga yo'l (pywebpush fayl yo'lini kutadi)
    pem_file = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), "vapid_private.pem")
    if not _os.path.exists(pem_file):
        return

    # Venue admin/owner foydalanuvchilari
    user_ids = [u.id for u in db.scalars(
        select(models.User).where(
            models.User.venue_id == venue_id,
            models.User.role.in_(["admin", "owner"]),
        )
    ).all()]
    if not user_ids:
        return
    subscriptions = db.scalars(
        select(models.PushSubscription).where(models.PushSubscription.user_id.in_(user_ids))
    ).all()

    payload = _json.dumps({"title": title, "body": body, "url": url, "icon": "/favicon.png"})
    failed_endpoints = []
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=pem_file,
                vapid_claims={"sub": f"mailto:{settings.VAPID_EMAIL}"},
            )
        except WebPushException as e:
            # 410 — obuna eskirgan, o'chirish kerak
            if e.response is not None and e.response.status_code in (404, 410):
                failed_endpoints.append(sub.id)
        except Exception:
            pass

    # Eskirgan obunalarni o'chirish
    for sub_id in failed_endpoints:
        s = db.get(models.PushSubscription, sub_id)
        if s:
            db.delete(s)
    if failed_endpoints:
        db.flush()


def _order_items_text(items: list) -> str:
    """Max 5 ta mahsulot nomini qaytaradi."""
    lines = []
    for i, item in enumerate(items):
        if i >= 5:
            lines.append(f"  …va yana {len(items)-5} ta")
            break
        lines.append(f"  {i+1}. {item.product_name} × {item.quantity}")
    return "\n".join(lines)


def _send_telegram_notification(db: Session, venue_id: int, title: str, body: str) -> None:
    """Admin/owner foydalanuvchilarga Telegram orqali xabar yuborish."""
    venue = db.get(models.Venue, venue_id)
    if not venue or not venue.telegram_bot_token:
        return
    admins = db.scalars(
        select(models.User).where(
            models.User.venue_id == venue_id,
            models.User.role.in_(["admin", "owner"]),
        )
    ).all()
    for admin in admins:
        link = db.scalar(
            select(models.UserTelegram).where(models.UserTelegram.user_id == admin.id)
        )
        if link:
            _tg_send(
                venue.telegram_bot_token,
                "sendMessage",
                {
                    "chat_id": link.chat_id,
                    "text": f"🏪 *{venue.name}*\n\n💰 *{title}*\n{body}",
                    "parse_mode": "Markdown",
                },
            )


@app.get("/api/push/vapid-key", response_model=schemas.VapidPublicKeyResponse, tags=["push"])
async def get_vapid_public_key() -> schemas.VapidPublicKeyResponse:
    return schemas.VapidPublicKeyResponse(publicKey=settings.VAPID_PUBLIC_KEY)


@app.post("/api/push/subscribe", tags=["push"])
async def push_subscribe(
    payload: schemas.PushSubscriptionInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
):
    p256dh = payload.keys.get("p256dh", "")
    auth_key = payload.keys.get("auth", "")
    if not p256dh or not auth_key:
        raise HTTPException(status_code=422, detail="Missing keys")
    # Mavjud bo'lsa yangilash, bo'lmasa yaratish
    existing = db.scalar(
        select(models.PushSubscription).where(models.PushSubscription.endpoint == payload.endpoint)
    )
    if existing:
        existing.user_id = current_user.id
        existing.venue_id = current_user.venueId
        existing.p256dh = p256dh
        existing.auth = auth_key
        existing.user_agent = payload.userAgent
    else:
        db.add(models.PushSubscription(
            user_id=current_user.id,
            venue_id=current_user.venueId,
            endpoint=payload.endpoint,
            p256dh=p256dh,
            auth=auth_key,
            user_agent=payload.userAgent,
        ))
    db.flush()
    return {"detail": "subscribed"}


@app.post("/api/push/unsubscribe", tags=["push"])
async def push_unsubscribe(
    endpoint: str,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
):
    sub = db.scalar(select(models.PushSubscription).where(models.PushSubscription.endpoint == endpoint))
    if sub:
        db.delete(sub)
    return {"detail": "unsubscribed"}


@app.post("/api/push/test", tags=["push"])
async def push_test(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
):
    """Test xabar yuborish (debug uchun)."""
    if current_user.venueId:
        _send_push_notification(
            db, current_user.venueId,
            title="Test bildirishnoma",
            body=f"Salom, {current_user.name or current_user.username}! Push ishlayapti.",
            url="/admin/dashboard",
        )
    return {"detail": "sent"}


@app.post("/api/user/telegram/link", tags=["telegram"])
async def link_telegram_chat(
    input: schemas.TelegramLinkInput,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
):
    """Joriy foydalanuvchiga Telegram chat ID ni bog'lash."""
    existing = db.scalar(
        select(models.UserTelegram).where(models.UserTelegram.user_id == current_user.id)
    )
    if existing:
        existing.chat_id = input.chatId
    else:
        db.add(models.UserTelegram(user_id=current_user.id, chat_id=input.chatId))
    db.flush()
    return {"ok": True}


# ============================================================================
# PRODUCT ANALYTICS — Top/Bottom 5 by profit, sales count
# ============================================================================


@app.get(
    "/api/venues/{venueId}/analytics/products",
    tags=["analytics"],
)
async def get_product_analytics(
    venueId: int,
    period: str = "all",  # day|month|year|all
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
):
    """Mahsulotlar bo'yicha analitik:
    - Eng ko'p foyda keltirgan top 5
    - Eng kam foyda / zarar keltirgan top 5
    - Eng ko'p sotilgan top 5
    - Eng kam sotilgan top 5
    """
    _require_venue_access(current_user, venueId)
    now = _now_utc()
    start = None
    if period == "day":
        start = datetime(now.year, now.month, now.day, tzinfo=now.tzinfo)
    elif period == "year":
        start = datetime(now.year, 1, 1, tzinfo=now.tzinfo)
    elif period == "month":
        start = datetime(now.year, now.month, 1, tzinfo=now.tzinfo)

    # OrderItem larni Order bilan join qilib olish
    q = (
        select(models.OrderItem, models.Order)
        .join(models.Order, models.OrderItem.order_id == models.Order.id)
        .where(
            models.Order.venue_id == venueId,
            models.Order.status.in_(["completed", "debt"]),
        )
    )
    if start:
        q = q.where(models.Order.created_at >= start)

    rows = db.execute(q).all()

    # Mahsulot bo'yicha agregat
    by_product: dict[int, dict] = {}
    for oi, _o in rows:
        pid = oi.product_id
        if pid not in by_product:
            by_product[pid] = {
                "productId": pid,
                "productName": oi.product_name,
                "quantitySold": 0,
                "revenue": 0.0,
                "costTotal": 0.0,
            }
        line_total = float(oi.total)
        by_product[pid]["quantitySold"] += int(oi.quantity)
        by_product[pid]["revenue"] += line_total

    # Tan narxni hisoblash uchun har bir mahsulot uchun:
    # 1) Direct mahsulot bo'lsa — InventoryItem.cost_price * quantity
    # 2) Ingredient asosida bo'lsa — recipe orqali masalliq cost'lari yig'indisi
    for pid, data in by_product.items():
        product = db.get(models.Product, pid)
        if not product:
            continue
        qty = data["quantitySold"]
        # Direct match
        direct = db.scalar(
            select(models.InventoryItem).where(
                models.InventoryItem.venue_id == venueId,
                models.InventoryItem.item_type == "direct",
                models.InventoryItem.name == product.name,
            )
        )
        if direct:
            data["costTotal"] = float(direct.cost_price) * qty
        else:
            # Recipe orqali
            recipes = db.scalars(
                select(models.ProductRecipe).where(models.ProductRecipe.product_id == pid)
            ).all()
            recipe_cost = 0.0
            for r in recipes:
                inv = db.get(models.InventoryItem, r.inventory_item_id)
                if inv:
                    recipe_cost += float(r.quantity) * float(inv.cost_price)
            data["costTotal"] = recipe_cost * qty

        data["profit"] = data["revenue"] - data["costTotal"]
        data["profitMargin"] = (data["profit"] / data["revenue"] * 100) if data["revenue"] > 0 else 0

    items = list(by_product.values())

    top_profit = sorted(items, key=lambda x: x["profit"], reverse=True)[:5]
    bottom_profit = sorted(items, key=lambda x: x["profit"])[:5]
    top_sold = sorted(items, key=lambda x: x["quantitySold"], reverse=True)[:5]
    bottom_sold = sorted(items, key=lambda x: x["quantitySold"])[:5]

    return {
        "topProfit": top_profit,
        "bottomProfit": bottom_profit,
        "topSold": top_sold,
        "bottomSold": bottom_sold,
    }


# ============================================================================
# ONLINE ORDERS (Telegram WebApp)
# ============================================================================


def _online_order_to_schema(db: Session, o: models.OnlineOrder) -> schemas.OnlineOrder:
    items = []
    try:
        items = json.loads(o.items_json or "[]")
    except Exception:
        items = []
    accepted_name = None
    if o.accepted_by:
        u = db.get(models.User, o.accepted_by)
        accepted_name = (u.name or u.username) if u else None
    courier_name = None
    if o.courier_id:
        u = db.get(models.User, o.courier_id)
        courier_name = (u.name or u.username) if u else None
    return schemas.OnlineOrder(
        id=o.id,
        venueId=o.venue_id,
        customerName=o.customer_name,
        customerPhone=o.customer_phone,
        customerAddress=o.customer_address,
        telegramUserId=o.telegram_user_id,
        telegramUsername=o.telegram_username,
        items=[schemas.OnlineOrderItem(**it) for it in items],
        totalAmount=float(o.total_amount),
        status=o.status,  # type: ignore[arg-type]
        notes=o.notes,
        deliveryType=o.delivery_type,  # type: ignore[arg-type]
        latitude=float(o.latitude) if o.latitude is not None else None,
        longitude=float(o.longitude) if o.longitude is not None else None,
        acceptedBy=o.accepted_by,
        acceptedByName=accepted_name,
        courierId=o.courier_id,
        courierName=courier_name,
        posOrderId=o.pos_order_id,
        createdAt=o.created_at,
        updatedAt=o.updated_at,
    )


# Public endpoint — Telegram WebApp dan buyurtma yaratish (autentifikatsiyasiz)
@app.post(
    "/api/public/online-orders/{venueId}",
    response_model=schemas.OnlineOrder,
    status_code=status.HTTP_201_CREATED,
    tags=["public"],
)
async def public_create_online_order(
    venueId: int,
    payload: schemas.OnlineOrderInput,
    db: Session = Depends(get_db),
) -> schemas.OnlineOrder:
    """Telegram WebApp orqali kelgan buyurtma."""
    venue = db.get(models.Venue, venueId)
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    _require_setting_enabled(db, venueId, "onlineOrdersEnabled")

    # Mahsulotlarni va narxlarni tasdiqlash
    total = 0.0
    items_data = []
    for item in payload.items:
        product = db.get(models.Product, item.productId)
        if not product or product.venue_id != venueId:
            raise HTTPException(status_code=404, detail=f"Product {item.productId} not found")
        line_total = float(product.price) * item.quantity
        total += line_total
        items_data.append({
            "productId": product.id,
            "name": product.name,
            "quantity": item.quantity,
            "price": float(product.price),
            "imageUrl": product.image_url,
        })

    # TelegramCustomer dan telefon va username ni olish
    tg_username = payload.telegramUsername
    tg_phone = payload.customerPhone
    if payload.telegramUserId:
        tc = db.query(models.TelegramCustomer).filter(
            models.TelegramCustomer.venue_id == venueId,
            models.TelegramCustomer.telegram_user_id == payload.telegramUserId,
        ).first()
        if tc:
            if not tg_phone and tc.phone:
                tg_phone = tc.phone
            if not tg_username:
                tg_username = tc.telegram_username

    o = models.OnlineOrder(
        venue_id=venueId,
        customer_name=payload.customerName,
        customer_phone=tg_phone,
        customer_address=payload.customerAddress,
        telegram_user_id=payload.telegramUserId,
        telegram_username=tg_username,
        items_json=json.dumps(items_data),
        total_amount=total,
        status="new",
        notes=payload.notes,
        delivery_type=payload.deliveryType,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    db.add(o)
    db.flush()
    db.refresh(o)

    # Push notification — yangi onlayn buyurtma
    try:
        items_str = "\n".join(
            f"  {i+1}. {it.name} × {it.quantity}"
            for i, it in enumerate(payload.items[:5])
        ) if payload.items else ""
        if len(payload.items) > 5:
            items_str += f"\n  …va yana {len(payload.items)-5} ta"
        tg_body = f"Buyurtma #{o.id}"
        tg_body += f"\nMijoz: {payload.customerName or '—'}"
        tg_body += f"\nYetkazish: {payload.deliveryType}"
        if items_str:
            tg_body += f"\n\n{items_str}"
        tg_body += f"\n\nJami: {total:,.0f} so'm"
        _send_push_notification(
            db, venueId,
            title=f"🛵 Yangi onlayn buyurtma #{o.id}",
            body=f"{payload.customerName} · {total:,.0f} so'm · {payload.deliveryType}",
            url="/admin/online-orders",
        )
        _send_telegram_notification(
            db, venueId,
            title="Yangi onlayn buyurtma",
            body=tg_body,
        )
    except Exception:
        pass

    return _online_order_to_schema(db, o)


@app.get(
    "/api/public/online-orders/{venueId}/history",
    response_model=list[schemas.OnlineOrder],
    tags=["public"],
)
async def public_online_order_history(
    venueId: int,
    telegram_user_id: str,
    db: Session = Depends(get_db),
):
    """Telegram foydalanuvchining buyurtma tarixi."""
    orders = db.scalars(
        select(models.OnlineOrder)
        .where(
            models.OnlineOrder.venue_id == venueId,
            or_(
                models.OnlineOrder.telegram_user_id == telegram_user_id,
                models.OnlineOrder.telegram_user_id.is_(None),
                models.OnlineOrder.telegram_user_id == "",
            ),
        )
        .order_by(models.OnlineOrder.created_at.desc())
        .limit(50)
    ).all()
    return [_online_order_to_schema(db, o) for o in orders]


@app.get(
    "/api/venues/{venueId}/online-orders",
    response_model=list[schemas.OnlineOrder],
    tags=["online-orders"],
)
async def list_online_orders(
    venueId: int,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.OnlineOrder]:
    _require_venue_access(current_user, venueId)
    if current_user.role != "public":
        _require_setting_enabled(db, venueId, "onlineOrdersEnabled")
    q = select(models.OnlineOrder).where(models.OnlineOrder.venue_id == venueId)

    # Dastavkachi faqat o'zi qabul qilgan va yangi buyurtmalarni ko'radi
    if current_user.role == "dastavkachi":
        q = q.where(
            or_(
                models.OnlineOrder.status == "new",
                models.OnlineOrder.accepted_by == current_user.id,
            )
        )

    # Oshpaz faqat o'ziga biriktirilgan yoki biriktirilmagan buyurtmalarni ko'radi
    if current_user.role == "oshpaz":
        q = q.where(
            or_(
                models.OnlineOrder.chef_id == current_user.id,
                models.OnlineOrder.chef_id.is_(None),
            )
        )

    if status_filter and status_filter != "all":
        q = q.where(models.OnlineOrder.status == status_filter)
    q = q.order_by(models.OnlineOrder.id.desc()).limit(200)
    orders = db.scalars(q).all()
    return [_online_order_to_schema(db, o) for o in orders]


def _create_pos_order_from_online_order(db: Session, venue_id: int, oo: models.OnlineOrder) -> int | None:
    """Onlayn buyurtma qabul qilinganda ochiq (kutuvchi) POS order yaratadi.
    Inventar kamaytirish kassir to'lovni amalga oshirganda `pay_open_order` da bajariladi."""
    try:
        items_data = json.loads(oo.items_json or "[]")
    except Exception:
        items_data = []
    if not items_data:
        return None

    total_amount = float(oo.total_amount)
    order = models.Order(
        venue_id=venue_id,
        customer_id=None,
        waiter_id=oo.accepted_by,
        total_amount=total_amount,
        payment_type="cash",
        status="open",
        source="online",
        notes=f"Onlayn buyurtma #{oo.id} — {oo.customer_name}",
        created_at=oo.created_at,
    )
    db.add(order)
    db.flush()

    for item in items_data:
        db.add(models.OrderItem(
            order_id=order.id,
            product_id=item.get("productId", 0),
            product_name=item.get("name", ""),
            quantity=item.get("quantity", 0),
            unit_price=item.get("price", 0),
            discount_pct=0,
            total=float(item.get("price", 0)) * int(item.get("quantity", 0)),
        ))

    db.flush()
    db.refresh(order)

    # Inventarni real-time kamaytirish (oshxona buyurtmani qabul qilganda)
    order_items = db.scalars(
        select(models.OrderItem).where(models.OrderItem.order_id == order.id)
    ).all()
    _deduct_inventory_on_sale(db, venue_id, order_items)

    return order.id


@app.patch(
    "/api/venues/{venueId}/online-orders/{orderId}/status",
    response_model=schemas.OnlineOrder,
    tags=["online-orders"],
)
async def update_online_order_status(
    venueId: int,
    orderId: int,
    payload: schemas.OnlineOrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> schemas.OnlineOrder:
    _require_venue_access(current_user, venueId)
    if current_user.role != "public":
        _require_setting_enabled(db, venueId, "onlineOrdersEnabled")
    o = db.get(models.OnlineOrder, orderId)
    if not o or o.venue_id != venueId:
        raise HTTPException(status_code=404, detail="Online order not found")

    role = current_user.role
    new_status = payload.status
    current_status = o.status

    # Ruxsat etilgan status o'tishlarini tekshirish
    allowed = False

    # Dastavkachi/admin/owner: new → accepted, new → cancelled
    if current_status == "new" and new_status in ("accepted", "cancelled"):
        if role in ("dastavkachi", "admin", "owner"):
            allowed = True

    # Dastavkachi/admin/owner: accepted → preparing
    if current_status == "accepted" and new_status == "preparing":
        if role in ("dastavkachi", "admin", "owner"):
            allowed = True

    # Oshpaz/admin/owner: preparing → ready
    if current_status == "preparing" and new_status == "ready":
        if role in ("oshpaz", "admin", "owner"):
            allowed = True

    # Dastavkachi/admin/owner: ready → delivering (delivery), ready → delivered (pickup)
    if current_status == "ready" and new_status == "delivering" and o.delivery_type == "delivery":
        if role in ("dastavkachi", "admin", "owner"):
            allowed = True
    if current_status == "ready" and new_status == "delivered" and o.delivery_type == "pickup":
        if role in ("dastavkachi", "admin", "owner"):
            allowed = True

    # Dastavkachi/admin/owner: delivering → delivered
    if current_status == "delivering" and new_status == "delivered":
        if role in ("dastavkachi", "admin", "owner"):
            allowed = True

    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Holatni '{current_status}' dan '{new_status}' ga o'zgartirish mumkin emas",
        )

    # Birinchi qabul qilganni belgilash
    if new_status == "accepted" and o.accepted_by is None:
        o.accepted_by = current_user.id
        if o.pos_order_id is None:
            pos_order_id = _create_pos_order_from_online_order(db, venueId, o)
            if pos_order_id is not None:
                o.pos_order_id = pos_order_id

    # Oshpazni belgilash (preparing holatida)
    if new_status == "preparing" and o.chef_id is None:
        o.chef_id = current_user.id

    # Kuryerni belgilash
    if new_status == "delivering" and o.courier_id is None:
        o.courier_id = current_user.id

    o.status = new_status
    db.flush()
    db.refresh(o)
    return _online_order_to_schema(db, o)


# Public — onlayn menyu (cafe nomi orqali) — Telegram WebApp dan ham olinadi
# Allaqachon mavjud /api/public/menu/by-name/{venueName} endpoint


# ============================================================================
# TELEGRAM BOT WEBHOOK
# ============================================================================


def _tg_send(bot_token: str, method: str, payload: dict) -> dict:
    """Telegram Bot API'ga so'rov yuborish."""
    import requests
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{bot_token}/{method}",
            json=payload,
            timeout=10,
        )
        return r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/api/telegram/webhook/{venue_id}", tags=["telegram"])
async def telegram_webhook(
    venue_id: int,
    update: dict,
    db: Session = Depends(get_db),
):
    """Telegram Bot webhook — to'liq ro'yxatdan o'tish flow."""
    venue = db.get(models.Venue, venue_id)
    if not venue or not venue.telegram_bot_token:
        return {"ok": False}

    bot_token = venue.telegram_bot_token

    message = update.get("message")
    callback = update.get("callback_query")

    if message:
        chat_id = message["chat"]["id"]
        user = message.get("from", {})
        user_id = str(user.get("id", ""))
        text = message.get("text", "")
        contact = message.get("contact")

        # Mavjud customer
        customer = db.scalar(
            select(models.TelegramCustomer).where(
                models.TelegramCustomer.venue_id == venue_id,
                models.TelegramCustomer.telegram_user_id == user_id,
            )
        )

        if text.startswith("/start"):
            # Yangi yoki mavjud
            if customer is None:
                # Profil rasmini olish
                photo_url = _get_tg_user_photo(bot_token, user.get("id"))
                customer = models.TelegramCustomer(
                    venue_id=venue_id,
                    telegram_user_id=user_id,
                    telegram_username=user.get("username"),
                    first_name=user.get("first_name"),
                    last_name=user.get("last_name"),
                    chat_id=str(chat_id),
                    photo_url=photo_url,
                    language="uz",
                    is_registered=False,
                )
                db.add(customer)
                db.flush()
                db.refresh(customer)

            if not customer.is_registered:
                # Til tanlash
                _tg_send(bot_token, "sendMessage", {
                    "chat_id": chat_id,
                    "text": "🌐 Tilni tanlang / Выберите язык",
                    "reply_markup": {
                        "inline_keyboard": [[
                            {"text": "🇺🇿 O'zbekcha", "callback_data": "lang_uz"},
                            {"text": "🇷🇺 Русский", "callback_data": "lang_ru"},
                        ]]
                    },
                })
            else:
                # Allaqachon ro'yxatdan o'tgan
                _send_main_menu(bot_token, chat_id, venue, customer.language)

        elif contact:
            # Telefon raqam yuborildi
            if customer:
                customer.phone = contact.get("phone_number")
                customer.is_registered = True
                db.flush()
                # Admin/owner hisobiga telegram chat_id ni bog'lash
                phone_raw = contact.get("phone_number", "")
                phone_digits = "".join(c for c in phone_raw if c.isdigit())
                if phone_digits:
                    admins = db.scalars(
                        select(models.User).where(
                            models.User.venue_id == venue_id,
                            models.User.role.in_(["admin", "owner"]),
                            models.User.phone != None,
                        )
                    ).all()
                    for admin_user in admins:
                        admin_digits = "".join(c for c in admin_user.phone if c.isdigit())
                        if admin_digits and admin_digits[-9:] == phone_digits[-9:]:
                            existing = db.scalar(
                                select(models.UserTelegram).where(models.UserTelegram.user_id == admin_user.id)
                            )
                            if existing:
                                existing.chat_id = chat_id
                            else:
                                db.add(models.UserTelegram(user_id=admin_user.id, chat_id=chat_id))
                            db.flush()
                            break
                _tg_send(bot_token, "sendMessage", {
                    "chat_id": chat_id,
                    "text": (
                        "✅ Ro'yxatdan muvaffaqiyatli o'tdingiz!"
                        if customer.language == "uz"
                        else "✅ Регистрация прошла успешно!"
                    ),
                    "reply_markup": {"remove_keyboard": True},
                })
                _send_main_menu(bot_token, chat_id, venue, customer.language)

        elif text in ("📋 Menyuni ochish", "📋 Открыть меню", "/menu", "/menyu"):
            if customer and customer.is_registered:
                _send_main_menu(bot_token, chat_id, venue, customer.language)
            else:
                # Avval ro'yxat
                _tg_send(bot_token, "sendMessage", {
                    "chat_id": chat_id,
                    "text": "Avval /start buyrug'ini bosing" if (customer and customer.language == "uz") else "Сначала отправьте /start",
                })

        elif text in ("🌐 Tilni o'zgartirish", "🌐 Сменить язык"):
            _tg_send(bot_token, "sendMessage", {
                "chat_id": chat_id,
                "text": "🌐 Tilni tanlang / Выберите язык",
                "reply_markup": {
                    "inline_keyboard": [[
                        {"text": "🇺🇿 O'zbekcha", "callback_data": "lang_uz"},
                        {"text": "🇷🇺 Русский", "callback_data": "lang_ru"},
                    ]]
                },
            })

        elif text in ("📞 Aloqa", "📞 Контакты"):
            lang = customer.language if customer else "uz"
            phone_text = venue.phone or "—"
            address_text = venue.address or "—"
            if lang == "uz":
                contact_text = (
                    f"📞 *{venue.name}*\n\n"
                    f"📱 Telefon: {phone_text}\n"
                    f"📍 Manzil: {address_text}"
                )
            else:
                contact_text = (
                    f"📞 *{venue.name}*\n\n"
                    f"📱 Телефон: {phone_text}\n"
                    f"📍 Адрес: {address_text}"
                )
            if venue.latitude and venue.longitude:
                contact_text += (
                    f"\n\n📍 [Google Maps](https://www.google.com/maps?q={venue.latitude},{venue.longitude})"
                )
            _tg_send(bot_token, "sendMessage", {
                "chat_id": chat_id,
                "text": contact_text,
                "parse_mode": "Markdown",
            })

        elif text in ("🆔 Mening ID", "/myid", "/id"):
            _tg_send(bot_token, "sendMessage", {
                "chat_id": chat_id,
                "text": f"🆔 Sizning Telegram chattingiz ID: `{chat_id}`\n\nBu ID ni CRM dagi sozlamalarga kiritishingiz mumkin.",
                "parse_mode": "Markdown",
            })

    elif callback:
        chat_id = callback["message"]["chat"]["id"]
        user = callback.get("from", {})
        user_id = str(user.get("id", ""))
        data = callback.get("data", "")
        callback_id = callback["id"]

        _tg_send(bot_token, "answerCallbackQuery", {"callback_query_id": callback_id})

        customer = db.scalar(
            select(models.TelegramCustomer).where(
                models.TelegramCustomer.venue_id == venue_id,
                models.TelegramCustomer.telegram_user_id == user_id,
            )
        )

        if data in ("lang_uz", "lang_ru") and customer:
            customer.language = "uz" if data == "lang_uz" else "ru"
            db.flush()

            if customer.is_registered:
                _send_main_menu(bot_token, chat_id, venue, customer.language)
            else:
                # Telefon raqam so'rash
                if customer.language == "uz":
                    text = (
                        f"👋 Assalomu alaykum, {customer.first_name or ''}!\n\n"
                        f"*{venue.name}* botiga xush kelibsiz.\n\n"
                        f"📱 Buyurtma berish uchun telefon raqamingizni yuboring."
                    )
                    btn_text = "📱 Telefon raqamni yuborish"
                else:
                    text = (
                        f"👋 Здравствуйте, {customer.first_name or ''}!\n\n"
                        f"Добро пожаловать в *{venue.name}*.\n\n"
                        f"📱 Отправьте свой номер телефона для оформления заказов."
                    )
                    btn_text = "📱 Отправить номер"

                _tg_send(bot_token, "sendMessage", {
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "Markdown",
                    "reply_markup": {
                        "keyboard": [[{"text": btn_text, "request_contact": True}]],
                        "resize_keyboard": True,
                        "one_time_keyboard": True,
                    },
                })

    return {"ok": True}


def _get_tg_user_photo(bot_token: str, user_id) -> Optional[str]:
    """Telegram dan foydalanuvchi profil rasmi linkini olish."""
    try:
        photos = _tg_send(bot_token, "getUserProfilePhotos", {"user_id": user_id, "limit": 1})
        if not photos.get("ok") or photos["result"]["total_count"] == 0:
            return None
        # Eng katta o'lcham
        photo_sizes = photos["result"]["photos"][0]
        file_id = photo_sizes[-1]["file_id"]
        file_info = _tg_send(bot_token, "getFile", {"file_id": file_id})
        if not file_info.get("ok"):
            return None
        file_path = file_info["result"]["file_path"]
        return f"https://api.telegram.org/file/bot{bot_token}/{file_path}"
    except Exception:
        return None


def _send_main_menu(bot_token: str, chat_id: int, venue: models.Venue, lang: str) -> None:
    """Ro'yxatdan o'tilgan foydalanuvchiga asosiy menyu."""
    if lang == "uz":
        text = f"🍽 *{venue.name}*\n\nMenyumizni ko'rish uchun pastdagi tugmani bosing."
        menu_btn = "📋 Menyuni ochish"
        contact_btn = "📞 Aloqa"
        lang_btn = "🌐 Tilni o'zgartirish"
    else:
        text = f"🍽 *{venue.name}*\n\nНажмите кнопку ниже, чтобы открыть меню."
        menu_btn = "📋 Открыть меню"
        contact_btn = "📞 Контакты"
        lang_btn = "🌐 Сменить язык"

    base_url = settings.FRONTEND_PUBLIC_URL
    webapp_url = f"{base_url}/tg-menu/{venue.id}"

    _tg_send(bot_token, "sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
        "reply_markup": {
            "keyboard": [
                [{"text": menu_btn, "web_app": {"url": webapp_url}}],
                [{"text": contact_btn}, {"text": lang_btn}],
            ],
            "resize_keyboard": True,
        },
    })


@app.post("/api/venues/{venue_id}/telegram/setup-webhook", tags=["telegram"])
async def setup_telegram_webhook(
    venue_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.require_role("owner", "admin")),
):
    """Botga webhook URLni o'rnatish. Owner yoki admin ishlatadi."""
    venue = db.get(models.Venue, venue_id)
    if not venue or not venue.telegram_bot_token:
        raise HTTPException(status_code=400, detail="Bot token sozlanmagan")

    # Public URL (deploy paytida .env'da PUBLIC_URL sozlanadi)
    base = settings.PUBLIC_URL.rstrip("/")
    if base == "*" or not base.startswith("http"):
        raise HTTPException(
            status_code=400,
            detail="Public URL aniqlanmadi. .env'da PUBLIC_URL ni HTTPS URL'ga sozlang (masalan: https://resca.uz)",
        )
    if not base.startswith("https://"):
        raise HTTPException(
            status_code=400,
            detail="Telegram webhook uchun PUBLIC_URL HTTPS bo'lishi kerak (masalan: https://resca.uz)",
        )

    webhook_url = f"{base}/api/telegram/webhook/{venue_id}"

    result = _tg_send(venue.telegram_bot_token, "setWebhook", {
        "url": webhook_url,
        "allowed_updates": ["message", "callback_query"],
    })
    if not result.get("ok"):
        detail = result.get("description", str(result))
        err_code = result.get("error_code", 0)
        if err_code == 404:
            hint = " Bot token noto'g'ri yoki bot mavjud emas. @BotFather dan tokenni tekshiring."
        elif "HTTPS" in detail:
            hint = " PUBLIC_URL HTTPS bo'lishi kerak (masalan: https://resca.uz)"
        else:
            hint = ""
        raise HTTPException(status_code=400, detail=f"Telegram: {detail}.{hint}")
    return {"ok": True, "webhookUrl": webhook_url, "telegramResponse": result}


@app.get("/api/venues/{venue_id}/telegram/webhook-info", tags=["telegram"])
async def get_telegram_webhook_info(
    venue_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
):
    """Bot webhook holatini tekshirish."""
    _require_venue_access(current_user, venue_id)
    venue = db.get(models.Venue, venue_id)
    if not venue or not venue.telegram_bot_token:
        return {"configured": False}
    info = _tg_send(venue.telegram_bot_token, "getWebhookInfo", {})
    me = _tg_send(venue.telegram_bot_token, "getMe", {})
    return {
        "configured": True,
        "webhookInfo": info.get("result", {}),
        "botInfo": me.get("result", {}),
    }


@app.get(
    "/api/venues/{venueId}/telegram/customers",
    response_model=list[schemas.TelegramCustomer],
    tags=["telegram"],
)
async def list_telegram_customers(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.TelegramCustomer]:
    _require_venue_access(current_user, venueId)
    customers = db.scalars(
        select(models.TelegramCustomer)
        .where(models.TelegramCustomer.venue_id == venueId)
        .order_by(models.TelegramCustomer.id.desc())
    ).all()
    return [
        schemas.TelegramCustomer(
            id=c.id,
            venueId=c.venue_id,
            telegramUserId=c.telegram_user_id,
            telegramUsername=c.telegram_username,
            firstName=c.first_name,
            lastName=c.last_name,
            phone=c.phone,
            photoUrl=c.photo_url,
            language=c.language,
            chatId=c.chat_id,
            isRegistered=c.is_registered,
            createdAt=c.created_at,
        )
        for c in customers
    ]
