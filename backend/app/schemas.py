from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Literal, Dict, Any

from pydantic import BaseModel, Field


class HealthStatus(BaseModel):
    status: str


class LoginInput(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=64,
        pattern=r"^[A-Za-z0-9_.@-]+$",
    )
    password: str = Field(min_length=1, max_length=256)


class User(BaseModel):
    id: int
    username: str
    role: Literal["owner", "admin", "waiter"]
    name: Optional[str] = None
    venueId: Optional[int] = None
    venueName: Optional[str] = None
    createdAt: datetime


class UserInput(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=64,
        pattern=r"^[A-Za-z0-9_.@-]+$",
    )
    password: str
    name: Optional[str] = None
    role: Literal["owner", "admin", "waiter"]
    venueId: Optional[int] = None


class UserUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.@-]+$")
    password: Optional[str] = None
    name: Optional[str] = None
    role: Optional[Literal["owner", "admin", "waiter"]] = None
    venueId: Optional[int] = None


class AuthResponse(BaseModel):
    user: User
    token: str


class VenueBase(BaseModel):
    name: str
    type: Literal["cafe", "restaurant"]
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    instagram: Optional[str] = None
    telegram: Optional[str] = None
    facebook: Optional[str] = None


class VenueInput(VenueBase):
    pass


class VenueUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[Literal["cafe", "restaurant"]] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    instagram: Optional[str] = None
    telegram: Optional[str] = None
    facebook: Optional[str] = None


class Venue(VenueBase):
    id: int
    adminId: Optional[int] = None
    adminName: Optional[str] = None
    createdAt: datetime


class AdminAssignInput(BaseModel):
    userId: int


class VenueStats(BaseModel):
    todaySales: float
    totalRevenue: float
    totalDebts: float
    productCount: int
    orderCount: int


class ProductBase(BaseModel):
    name: str
    price: float
    category: str
    description: Optional[str] = None
    imageUrl: Optional[str] = None
    stock: Optional[int] = None
    isAvailable: Optional[bool] = True


class ProductInput(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    imageUrl: Optional[str] = None
    stock: Optional[int] = None
    isAvailable: Optional[bool] = None


class Product(ProductBase):
    id: int
    venueId: int
    createdAt: datetime


class CustomerBase(BaseModel):
    name: str
    phone: Optional[str] = None


class CustomerInput(CustomerBase):
    pass


class Customer(CustomerBase):
    id: int
    venueId: int
    totalDebt: float
    createdAt: datetime


class OrderItemInput(BaseModel):
    productId: int
    quantity: int
    discountPct: Optional[float] = 0


class OrderItem(BaseModel):
    productId: int
    productName: str
    quantity: int
    unitPrice: float
    discountPct: Optional[float] = 0
    total: float


class PaymentSplit(BaseModel):
    cash: Optional[float] = 0
    card: Optional[float] = 0
    transfer: Optional[float] = 0
    debt: Optional[float] = 0


class OrderBase(BaseModel):
    customerId: Optional[int] = None
    roomId: Optional[int] = None
    tableId: Optional[int] = None
    tableNumber: Optional[int] = None
    roomName: Optional[str] = None
    paymentType: Literal["cash", "card", "transfer", "debt"]
    paymentSplit: Optional[PaymentSplit] = None
    notes: Optional[str] = None


class OrderInput(OrderBase):
    items: List[OrderItemInput]


class Order(BaseModel):
    id: int
    venueId: int
    customerId: Optional[int] = None
    customerName: Optional[str] = None
    totalAmount: float
    paymentType: Literal["cash", "card", "transfer", "debt"]
    paymentSplit: Optional[PaymentSplit] = None
    status: Literal["open", "completed", "debt", "cancelled"]
    notes: Optional[str] = None
    createdAt: datetime


class OrderDetail(Order):
    items: List[OrderItem]


# --- Waiter/Open Orders API (used by lib/api-client-react/src/waiter-api.ts) ---

class OpenOrderItem(OrderItem):
    id: int


class ActiveOrder(BaseModel):
    id: int
    venueId: int
    tableId: Optional[int] = None
    tableNumber: Optional[int] = None
    roomId: Optional[int] = None
    roomName: Optional[str] = None
    waiterId: Optional[int] = None
    waiterName: Optional[str] = None
    totalAmount: float
    notes: Optional[str] = None
    createdAt: datetime
    items: List[OpenOrderItem]


class WaiterUser(BaseModel):
    id: int
    username: str
    name: Optional[str] = None
    venueId: Optional[int] = None
    createdAt: datetime


class CreateWaiterInput(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.@-]+$")
    password: str = Field(min_length=1, max_length=256)
    name: Optional[str] = None


class CreateOpenOrderItemInput(BaseModel):
    productId: int
    quantity: int
    discountPct: Optional[float] = 0


class CreateOpenOrderInput(BaseModel):
    tableId: Optional[int] = None
    tableNumber: Optional[int] = None
    roomId: Optional[int] = None
    roomName: Optional[str] = None
    items: List[CreateOpenOrderItemInput]
    notes: Optional[str] = None


class UpdateOpenOrderInput(BaseModel):
    items: List[CreateOpenOrderItemInput]
    notes: Optional[str] = None


class PayOpenOrderInput(BaseModel):
    paymentType: Literal["cash", "card", "transfer", "debt"]
    paymentSplit: Optional[Dict[str, float]] = None
    customerId: Optional[int] = None
    notes: Optional[str] = None
    items: Optional[List[CreateOpenOrderItemInput]] = None


class PayOpenOrderResult(BaseModel):
    id: int
    status: str
    totalAmount: float


class RoomBase(BaseModel):
    name: str
    description: Optional[str] = None


class RoomInput(RoomBase):
    pass


class RoomUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    isActive: Optional[bool] = None


class TableBase(BaseModel):
    roomId: Optional[int] = None
    number: int
    name: Optional[str] = None
    capacity: Optional[int] = None


class TableInput(TableBase):
    pass


class TableUpdate(BaseModel):
    roomId: Optional[int] = None
    number: Optional[int] = None
    name: Optional[str] = None
    capacity: Optional[int] = None
    isActive: Optional[bool] = None


class Room(RoomBase):
    id: int
    venueId: int
    isActive: bool
    createdAt: datetime


class Table(TableBase):
    id: int
    venueId: int
    isActive: bool
    createdAt: datetime


class RoomBookingBase(BaseModel):
    roomId: int
    tableId: Optional[int] = None
    customerName: str
    customerPhone: Optional[str] = None
    startAt: datetime
    endAt: datetime
    notes: Optional[str] = None


class RoomBookingInput(RoomBookingBase):
    pass


class RoomBookingUpdate(BaseModel):
    customerName: Optional[str] = None
    customerPhone: Optional[str] = None
    startAt: Optional[datetime] = None
    endAt: Optional[datetime] = None
    notes: Optional[str] = None
    status: Optional[Literal["active", "completed", "cancelled"]] = None


class RoomBooking(RoomBookingBase):
    id: int
    venueId: int
    status: Literal["active", "completed", "cancelled"]
    createdAt: datetime


class Debt(BaseModel):
    id: int
    venueId: int
    customerId: int
    customerName: str
    customerPhone: Optional[str] = None
    orderId: int
    amount: float
    paidAmount: float
    remaining: float
    status: Literal["unpaid", "paid", "partial"]
    paidAt: Optional[datetime] = None
    createdAt: datetime


class DebtPayInput(BaseModel):
    amount: float


class SalesReportMonth(BaseModel):
    month: int
    monthName: str
    revenue: float
    orderCount: int


class SalesReport(BaseModel):
    year: int
    totalRevenue: float
    totalOrders: int
    monthlySales: List[SalesReportMonth]
    allOrders: List[OrderDetail]


class TopProduct(BaseModel):
    productId: int
    productName: str
    totalSold: int
    revenue: float


class DashboardSummary(BaseModel):
    todayRevenue: float
    todayOrderCount: int
    totalDebt: float
    unpaidDebtCount: int
    topProducts: List[TopProduct]
    recentOrders: List[Order]


class VenueStat(BaseModel):
    venueId: int
    venueName: str
    todayRevenue: float
    totalDebt: float
    orderCount: int


class OwnerSummary(BaseModel):
    totalVenues: int
    totalRevenue: float
    totalDebt: float
    venueStats: List[VenueStat]


class PublicVenue(BaseModel):
    id: int
    name: str
    type: str
    address: Optional[str] = None
    phone: Optional[str] = None
    instagram: Optional[str] = None
    telegram: Optional[str] = None
    facebook: Optional[str] = None


class PublicProduct(BaseModel):
    id: int
    name: str
    price: float
    category: str
    description: Optional[str] = None
    imageUrl: Optional[str] = None


class PublicMenu(BaseModel):
    venue: PublicVenue
    products: list[PublicProduct]

