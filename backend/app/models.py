from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column("password_hash", Text, nullable=False)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String, nullable=False, default="admin")  # owner|admin|kassir|waiter|oshpaz|mangalchi|dastavkachi
    phone: Mapped[str | None] = mapped_column("phone", Text, nullable=True)
    venue_id: Mapped[int | None] = mapped_column("venue_id", Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


class Venue(Base):
    __tablename__ = "venues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False, default="cafe")  # cafe|restaurant
    logo_url: Mapped[str | None] = mapped_column("logo_url", Text, nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    instagram: Mapped[str | None] = mapped_column(Text, nullable=True)
    telegram: Mapped[str | None] = mapped_column(Text, nullable=True)
    facebook: Mapped[str | None] = mapped_column(Text, nullable=True)
    telegram_bot_token: Mapped[str | None] = mapped_column("telegram_bot_token", Text, nullable=True)
    latitude: Mapped[float | None] = mapped_column("latitude", Numeric(10, 7), nullable=True)
    longitude: Mapped[float | None] = mapped_column("longitude", Numeric(10, 7), nullable=True)
    admin_id: Mapped[int | None] = mapped_column("admin_id", Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column("image_url", Text, nullable=True)
    stock: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_available: Mapped[bool] = mapped_column("is_available", Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


class Table(Base):
    __tablename__ = "tables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, nullable=False)
    room_id: Mapped[int | None] = mapped_column("room_id", Integer, nullable=True)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True, default=4)
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


class RoomBooking(Base):
    __tablename__ = "room_bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, nullable=False)
    room_id: Mapped[int] = mapped_column("room_id", Integer, nullable=False)
    table_id: Mapped[int | None] = mapped_column("table_id", Integer, nullable=True)
    customer_name: Mapped[str] = mapped_column("customer_name", Text, nullable=False)
    customer_phone: Mapped[str | None] = mapped_column("customer_phone", Text, nullable=True)
    start_at: Mapped[datetime] = mapped_column("start_at", DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column("end_at", DateTime(timezone=True), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")  # active|completed|cancelled
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, nullable=False)
    customer_id: Mapped[int | None] = mapped_column("customer_id", Integer, nullable=True)
    waiter_id: Mapped[int | None] = mapped_column("waiter_id", Integer, nullable=True)
    room_id: Mapped[int | None] = mapped_column("room_id", Integer, nullable=True)
    table_id: Mapped[int | None] = mapped_column("table_id", Integer, nullable=True)
    table_number: Mapped[int | None] = mapped_column("table_number", Integer, nullable=True)
    room_name: Mapped[str | None] = mapped_column("room_name", Text, nullable=True)
    total_amount: Mapped[float] = mapped_column("total_amount", Numeric(12, 2), nullable=False)
    payment_type: Mapped[str] = mapped_column("payment_type", String, nullable=False, default="cash")
    payment_split: Mapped[str | None] = mapped_column("payment_split", Text, nullable=True)  # JSON string
    status: Mapped[str] = mapped_column(String, nullable=False, default="completed")  # open|completed|debt|cancelled
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updated_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=func.now(),
    )

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        primaryjoin="Order.id==foreign(OrderItem.order_id)",
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column("order_id", ForeignKey("orders.id"), nullable=False)
    product_id: Mapped[int] = mapped_column("product_id", Integer, nullable=False)
    product_name: Mapped[str] = mapped_column("product_name", Text, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column("unit_price", Numeric(12, 2), nullable=False)
    discount_pct: Mapped[float] = mapped_column("discount_pct", Numeric(5, 2), nullable=False, default=0)
    total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")


class Debt(Base):
    __tablename__ = "debts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, nullable=False)
    customer_id: Mapped[int] = mapped_column("customer_id", Integer, nullable=False)
    order_id: Mapped[int] = mapped_column("order_id", Integer, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    paid_amount: Mapped[float] = mapped_column("paid_amount", Numeric(12, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String, nullable=False, default="unpaid")  # unpaid|paid|partial
    paid_at: Mapped[datetime | None] = mapped_column("paid_at", DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


class InventoryItem(Base):
    """Omborxonadagi mahsulot (xomashyo, ingredientlar, tayyor mahsulotlar)."""
    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False, default="boshqa")
    item_type: Mapped[str] = mapped_column("item_type", String, nullable=False, default="ingredient")  # direct|ingredient
    image_url: Mapped[str | None] = mapped_column("image_url", Text, nullable=True)
    unit: Mapped[str] = mapped_column(String, nullable=False, default="dona")  # kg|litr|dona|pachka|quti — sotuv birligi
    pack_unit: Mapped[str | None] = mapped_column("pack_unit", String, nullable=True)  # blok|quti|meshok — kirim birligi
    pack_size: Mapped[float] = mapped_column("pack_size", Numeric(12, 3), nullable=False, default=1)  # 1 kirim birligida nechta sotuv birligi
    quantity: Mapped[float] = mapped_column("quantity", Numeric(12, 3), nullable=False, default=0)  # sotuv birligida
    min_quantity: Mapped[float] = mapped_column("min_quantity", Numeric(12, 3), nullable=False, default=0)
    cost_price: Mapped[float] = mapped_column("cost_price", Numeric(12, 2), nullable=False, default=0)
    sell_price: Mapped[float] = mapped_column("sell_price", Numeric(12, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


class ProductRecipe(Base):
    """Mahsulot retsepti — har bir taom uchun qaysi ingredientdan qancha ketishi."""
    __tablename__ = "product_recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column("product_id", ForeignKey("products.id"), nullable=False)
    inventory_item_id: Mapped[int] = mapped_column("inventory_item_id", ForeignKey("inventory_items.id"), nullable=False)
    quantity: Mapped[float] = mapped_column("quantity", Numeric(12, 3), nullable=False)  # bitta taom uchun ketadigan miqdor

    product: Mapped["Product"] = relationship()
    inventory_item: Mapped[InventoryItem] = relationship()


class InventoryTransaction(Base):
    """Omborga kirim yoki chiqim operatsiyalari."""
    __tablename__ = "inventory_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, nullable=False)
    item_id: Mapped[int] = mapped_column("item_id", ForeignKey("inventory_items.id"), nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)  # in|out
    quantity: Mapped[float] = mapped_column("quantity", Numeric(12, 3), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column("created_by", Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    item: Mapped[InventoryItem] = relationship()



class VenueSettings(Base):
    """Venue (kafe/restoran) funksiyalari sozlamalari — admin tomonidan boshqariladi."""
    __tablename__ = "venue_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, unique=True, nullable=False)

    # Chek sozlamalari
    receipt_qr_enabled: Mapped[bool] = mapped_column("receipt_qr_enabled", Boolean, nullable=False, default=True)
    receipt_logo_enabled: Mapped[bool] = mapped_column("receipt_logo_enabled", Boolean, nullable=False, default=True)

    # Onlayn buyurtma
    online_orders_enabled: Mapped[bool] = mapped_column("online_orders_enabled", Boolean, nullable=False, default=False)

    # Kassir huquqlari
    kassir_cancel_receipt: Mapped[bool] = mapped_column("kassir_cancel_receipt", Boolean, nullable=False, default=False)
    kassir_give_discount: Mapped[bool] = mapped_column("kassir_give_discount", Boolean, nullable=False, default=False)

    # Bron
    room_booking_enabled: Mapped[bool] = mapped_column("room_booking_enabled", Boolean, nullable=False, default=True)

    # Afitsiant huquqlari
    waiter_cancel_order: Mapped[bool] = mapped_column("waiter_cancel_order", Boolean, nullable=False, default=False)
    waiter_give_discount: Mapped[bool] = mapped_column("waiter_give_discount", Boolean, nullable=False, default=False)

    # Oshxona
    kitchen_auto_accept: Mapped[bool] = mapped_column("kitchen_auto_accept", Boolean, nullable=False, default=False)

    # Inventar
    inventory_low_alert: Mapped[bool] = mapped_column("inventory_low_alert", Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


class Expense(Base):
    """Xarajatlar yozuvi (kirim-chiqim: ijara, ish haqi, xomashyo, transport va h.k.)."""
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)  # ijara|ish_haqi|xomashyo|transport|boshqa
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    date: Mapped[datetime] = mapped_column("date", DateTime(timezone=True), nullable=False,
                                           default=lambda: datetime.now(timezone.utc))
    created_by: Mapped[int | None] = mapped_column("created_by", Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


class PushSubscription(Base):
    """Web Push obunalari (admin telefonlari uchun)."""
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column("user_id", Integer, nullable=False)
    venue_id: Mapped[int | None] = mapped_column("venue_id", Integer, nullable=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    user_agent: Mapped[str | None] = mapped_column("user_agent", Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


class OnlineOrder(Base):
    """Telegram WebApp orqali kelgan onlayn buyurtmalar."""
    __tablename__ = "online_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, nullable=False)
    customer_name: Mapped[str] = mapped_column("customer_name", Text, nullable=False)
    customer_phone: Mapped[str | None] = mapped_column("customer_phone", Text, nullable=True)
    customer_address: Mapped[str | None] = mapped_column("customer_address", Text, nullable=True)
    telegram_user_id: Mapped[str | None] = mapped_column("telegram_user_id", Text, nullable=True)
    telegram_username: Mapped[str | None] = mapped_column("telegram_username", Text, nullable=True)
    items_json: Mapped[str] = mapped_column("items_json", Text, nullable=False)  # [{productId,name,quantity,price}]
    total_amount: Mapped[float] = mapped_column("total_amount", Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="new")  # new|accepted|preparing|ready|delivering|delivered|cancelled
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_type: Mapped[str] = mapped_column(String, nullable=False, default="pickup")  # pickup|delivery
    latitude: Mapped[float | None] = mapped_column("latitude", Numeric(10, 7), nullable=True)
    longitude: Mapped[float | None] = mapped_column("longitude", Numeric(10, 7), nullable=True)
    accepted_by: Mapped[int | None] = mapped_column("accepted_by", Integer, nullable=True)  # kassir/oshpaz user_id
    courier_id: Mapped[int | None] = mapped_column("courier_id", Integer, nullable=True)
    pos_order_id: Mapped[int | None] = mapped_column("pos_order_id", Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updated_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=func.now(),
    )


class TelegramCustomer(Base):
    """Telegram bot orqali ro'yxatdan o'tgan mijozlar."""
    __tablename__ = "telegram_customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column("venue_id", Integer, nullable=False)
    telegram_user_id: Mapped[str] = mapped_column("telegram_user_id", String, nullable=False)
    telegram_username: Mapped[str | None] = mapped_column("telegram_username", Text, nullable=True)
    first_name: Mapped[str | None] = mapped_column("first_name", Text, nullable=True)
    last_name: Mapped[str | None] = mapped_column("last_name", Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column("photo_url", Text, nullable=True)
    language: Mapped[str] = mapped_column(String, nullable=False, default="uz")  # uz|ru
    chat_id: Mapped[str] = mapped_column("chat_id", String, nullable=False)
    is_registered: Mapped[bool] = mapped_column("is_registered", Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
