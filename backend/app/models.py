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
    role: Mapped[str] = mapped_column(String, nullable=False, default="admin")  # owner|admin|waiter
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
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    instagram: Mapped[str | None] = mapped_column(Text, nullable=True)
    telegram: Mapped[str | None] = mapped_column(Text, nullable=True)
    facebook: Mapped[str | None] = mapped_column(Text, nullable=True)
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

