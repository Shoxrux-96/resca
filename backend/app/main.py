from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, func
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
    _ensure_default_owner()


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
    if user.role not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _venue_to_schema(db: Session, v: models.Venue) -> schemas.Venue:
    admin_name = None
    if v.admin_id:
        admin = db.get(models.User, v.admin_id)
        admin_name = (admin.name or admin.username) if admin else None
    return schemas.Venue(
        id=v.id,
        name=v.name,
        type=v.type,  # type: ignore[arg-type]
        address=v.address,
        phone=v.phone,
        email=v.email,
        instagram=v.instagram,
        telegram=v.telegram,
        facebook=v.facebook,
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
    )


@app.get("/api/venues", response_model=list[schemas.Venue], tags=["venues"])
async def list_venues(
    db: Session = Depends(get_db),
    _: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.Venue]:
    venues = db.scalars(select(models.Venue).order_by(models.Venue.id.asc())).all()
    return [_venue_to_schema(db, v) for v in venues]

# --- Waiters (admin/owner) ---

@app.get(
    "/api/venues/{venueId}/waiters",
    response_model=list[schemas.WaiterUser],
    tags=["auth"],
)
async def list_waiters(
    venueId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.WaiterUser]:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    waiters = db.scalars(
        select(models.User)
        .where(models.User.venue_id == venueId, models.User.role == "waiter")
        .order_by(models.User.id.asc())
    ).all()
    return [
        schemas.WaiterUser(
            id=w.id,
            username=w.username,
            name=w.name,
            venueId=w.venue_id,
            createdAt=w.created_at,
        )
        for w in waiters
    ]


@app.post(
    "/api/venues/{venueId}/waiters",
    response_model=schemas.WaiterUser,
    status_code=status.HTTP_201_CREATED,
    tags=["auth"],
)
async def create_waiter(
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
    w = models.User(
        username=payload.username,
        password_hash=auth.hash_password(payload.password),
        name=payload.name,
        role="waiter",
        venue_id=venueId,
    )
    db.add(w)
    db.flush()
    db.refresh(w)
    return schemas.WaiterUser(id=w.id, username=w.username, name=w.name, venueId=w.venue_id, createdAt=w.created_at)


@app.delete(
    "/api/venues/{venueId}/waiters/{waiterId}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["auth"],
)
async def delete_waiter(
    venueId: int,
    waiterId: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> Response:
    _require_venue_access(current_user, venueId)
    _require_admin_or_owner(current_user)
    w = db.get(models.User, waiterId)
    if not w or w.venue_id != venueId or w.role != "waiter":
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
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(auth.get_current_user),
) -> list[schemas.ActiveOrder]:
    _require_venue_access(current_user, venueId)
    orders = db.scalars(
        select(models.Order)
        .options(joinedload(models.Order.items))
        .where(models.Order.venue_id == venueId, models.Order.status == "open")
        .order_by(models.Order.id.desc())
    ).unique().all()
    result: list[schemas.ActiveOrder] = []
    for o in orders:
        waiter_name = None
        if o.waiter_id:
            w = db.get(models.User, o.waiter_id)
            waiter_name = (w.name or w.username) if w else None
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
                notes=o.notes,
                createdAt=o.created_at,
                items=[_order_item_to_open_item(i) for i in o.items],
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
    if payload.tableId:
        _check_table_not_booked(db, venueId, payload.tableId)
    total_amount, model_items = _recalc_open_order_total(db, venueId, payload.items)
    order = models.Order(
        venue_id=venueId,
        customer_id=None,
        waiter_id=current_user.id if current_user.role == "waiter" else None,
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
    return schemas.ActiveOrder(
        id=order.id,
        venueId=order.venue_id,
        tableId=order.table_id,
        tableNumber=order.table_number,
        roomId=order.room_id,
        roomName=order.room_name,
        waiterId=order.waiter_id,
        waiterName=current_user.name or current_user.username if current_user.role == "waiter" else None,
        totalAmount=float(order.total_amount),
        notes=order.notes,
        createdAt=order.created_at,
        items=[_order_item_to_open_item(i) for i in order.items],
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
        raise HTTPException(status_code=403, detail="Forbidden")

    total_amount, model_items = _recalc_open_order_total(db, venueId, payload.items)
    order.total_amount = total_amount
    order.notes = payload.notes
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
    order = db.get(models.Order, orderId)
    if not order or order.venue_id != venueId or order.status != "open":
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    if current_user.role == "waiter" and order.waiter_id and order.waiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    order.status = "cancelled"
    db.add(order)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    order = db.scalar(
        select(models.Order).options(joinedload(models.Order.items)).where(models.Order.id == orderId, models.Order.venue_id == venueId)
    )
    if not order or order.status != "open":
        raise HTTPException(status_code=404, detail="Open order not found")
    if current_user.role == "waiter" and order.waiter_id and order.waiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

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
        address=payload.address,
        phone=payload.phone,
        email=payload.email,
        instagram=payload.instagram,
        telegram=payload.telegram,
        facebook=payload.facebook,
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
        # For split payments that include a debt portion, store only the debt part.
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
        address=v.address,
        phone=v.phone,
        instagram=v.instagram,
        telegram=v.telegram,
        facebook=v.facebook,
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
    products = db.scalars(
        select(models.Product)
        .where(models.Product.venue_id == v.id, models.Product.is_available == True)
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

