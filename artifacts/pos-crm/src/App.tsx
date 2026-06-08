import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Home from "@/pages/home";

import OwnerDashboard from "@/pages/owner/dashboard";
import OwnerVenues from "@/pages/owner/venues";
import OwnerVenueDetail from "@/pages/owner/venue-detail";
import OwnerUsers from "@/pages/owner/users";
import MenuPage from "@/pages/menu";

import AdminDashboard from "@/pages/admin/dashboard";
import AdminPos from "@/pages/admin/pos";
import AdminProducts from "@/pages/admin/products";
import AdminDebts from "@/pages/admin/debts";
import AdminRooms from "@/pages/admin/rooms";
import AdminReport from "@/pages/admin/report";
import AdminStaff from "@/pages/admin/waiters";
import AdminInventory from "@/pages/admin/inventory";
import AdminSettings from "@/pages/admin/settings";
import AdminExpenses from "@/pages/admin/expenses";
import AdminRevenue from "@/pages/admin/revenue";

import WaiterTables from "@/pages/waiter/tables";
import WaiterOrder from "@/pages/waiter/order";
import WaiterBookings from "@/pages/waiter/bookings";

import KassirDashboard from "@/pages/kassir/dashboard";
import OshpazOrders from "@/pages/oshpaz/orders";
import MangalchiOrders from "@/pages/mangalchi/orders";
import DastavkachiOrders from "@/pages/dastavkachi/orders";
import OnlineOrdersPage from "@/pages/online-orders";
import TelegramMenu from "@/pages/tg-menu";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

type AppRole = "owner" | "admin" | "kassir" | "waiter" | "oshpaz" | "mangalchi" | "dastavkachi";

const ROLE_HOME: Record<AppRole, string> = {
  owner: "/owner/dashboard",
  admin: "/admin/dashboard",
  kassir: "/kassir/dashboard",
  waiter: "/waiter/tables",
  oshpaz: "/oshpaz/orders",
  mangalchi: "/mangalchi/orders",
  dastavkachi: "/dastavkachi/orders",
};

function ProtectedRoute({
  component: Component,
  roles,
}: {
  component: React.ComponentType;
  roles: AppRole[];
}) {
  const { user, isAuthenticated } = useAuth();
  const userRole = (user?.role as string) ?? "";

  if (!isAuthenticated) return <Redirect to="/login" />;

  if (!roles.includes(userRole as AppRole)) {
    const home = ROLE_HOME[userRole as AppRole] ?? "/login";
    return <Redirect to={home} />;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function RootRedirect() {
  const { user, isAuthenticated } = useAuth();
  const userRole = (user?.role as string) ?? "";
  if (!isAuthenticated) return <Redirect to="/login" />;
  const home = ROLE_HOME[userRole as AppRole] ?? "/login";
  return <Redirect to={home} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />

      {/* Public routes */}
      <Route path="/menu/:venueName" component={MenuPage} />
      <Route path="/tg-menu/:venueId" component={TelegramMenu} />

      {/* Online Orders — admin/kassir/oshpaz/mangalchi/dastavkachi */}
      <Route path="/admin/online-orders" component={() => <ProtectedRoute component={OnlineOrdersPage} roles={["admin", "owner"]} />} />
      <Route path="/kassir/online-orders" component={() => <ProtectedRoute component={OnlineOrdersPage} roles={["kassir"]} />} />
      <Route path="/oshpaz/online-orders" component={() => <ProtectedRoute component={OnlineOrdersPage} roles={["oshpaz"]} />} />
      <Route path="/mangalchi/online-orders" component={() => <ProtectedRoute component={OnlineOrdersPage} roles={["mangalchi"]} />} />
      <Route path="/dastavkachi/online-orders" component={() => <ProtectedRoute component={OnlineOrdersPage} roles={["dastavkachi"]} />} />

      {/* Owner routes */}
      <Route path="/owner/dashboard" component={() => <ProtectedRoute component={OwnerDashboard} roles={["owner"]} />} />
      <Route path="/owner/venues" component={() => <ProtectedRoute component={OwnerVenues} roles={["owner"]} />} />
      <Route path="/owner/venues/:id" component={() => <ProtectedRoute component={OwnerVenueDetail} roles={["owner"]} />} />
      <Route path="/owner/users" component={() => <ProtectedRoute component={OwnerUsers} roles={["owner"]} />} />

      {/* Admin routes */}
      <Route path="/admin/dashboard" component={() => <ProtectedRoute component={AdminDashboard} roles={["admin"]} />} />
      <Route path="/admin/pos" component={() => <ProtectedRoute component={AdminPos} roles={["admin"]} />} />
      <Route path="/admin/products" component={() => <ProtectedRoute component={AdminProducts} roles={["admin"]} />} />
      <Route path="/admin/rooms" component={() => <ProtectedRoute component={AdminRooms} roles={["admin"]} />} />
      <Route path="/admin/staff" component={() => <ProtectedRoute component={AdminStaff} roles={["admin"]} />} />
      <Route path="/admin/inventory" component={() => <ProtectedRoute component={AdminInventory} roles={["admin"]} />} />
      <Route path="/admin/debts" component={() => <ProtectedRoute component={AdminDebts} roles={["admin"]} />} />
      <Route path="/admin/report" component={() => <ProtectedRoute component={AdminReport} roles={["admin"]} />} />
      <Route path="/admin/expenses" component={() => <ProtectedRoute component={AdminExpenses} roles={["admin"]} />} />
      <Route path="/admin/revenue" component={() => <ProtectedRoute component={AdminRevenue} roles={["admin"]} />} />
      <Route path="/admin/settings" component={() => <ProtectedRoute component={AdminSettings} roles={["admin"]} />} />

      {/* Kassir routes */}
      <Route path="/kassir/dashboard" component={() => <ProtectedRoute component={KassirDashboard} roles={["kassir"]} />} />
      <Route path="/kassir/pos" component={() => <ProtectedRoute component={AdminPos} roles={["kassir"]} />} />
      <Route path="/kassir/debts" component={() => <ProtectedRoute component={AdminDebts} roles={["kassir"]} />} />
      <Route path="/kassir/report" component={() => <ProtectedRoute component={AdminReport} roles={["kassir"]} />} />

      {/* Waiter routes */}
      <Route path="/waiter/tables" component={() => <ProtectedRoute component={WaiterTables} roles={["waiter"]} />} />
      <Route path="/waiter/bookings" component={() => <ProtectedRoute component={WaiterBookings} roles={["waiter"]} />} />
      <Route path="/waiter/table/:tableId" component={() => <ProtectedRoute component={WaiterOrder} roles={["waiter"]} />} />

      {/* Oshpaz routes */}
      <Route path="/oshpaz/orders" component={() => <ProtectedRoute component={OshpazOrders} roles={["oshpaz"]} />} />

      {/* Mangalchi routes */}
      <Route path="/mangalchi/orders" component={() => <ProtectedRoute component={MangalchiOrders} roles={["mangalchi"]} />} />

      {/* Dastavkachi routes */}
      <Route path="/dastavkachi/orders" component={() => <ProtectedRoute component={DastavkachiOrders} roles={["dastavkachi"]} />} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
