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
import AdminWaiters from "@/pages/admin/waiters";

import WaiterTables from "@/pages/waiter/tables";
import WaiterOrder from "@/pages/waiter/order";
import WaiterBookings from "@/pages/waiter/bookings";

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

function ProtectedRoute({
  component: Component,
  role,
}: {
  component: React.ComponentType;
  role: "owner" | "admin" | "waiter";
}) {
  const { user, isAuthenticated } = useAuth();
  const userRole = (user?.role as string) ?? "";

  if (!isAuthenticated) return <Redirect to="/login" />;

  if (role && userRole !== role) {
    if (userRole === "owner") return <Redirect to="/owner/dashboard" />;
    if (userRole === "admin") return <Redirect to="/admin/dashboard" />;
    if (userRole === "waiter") return <Redirect to="/waiter/tables" />;
    return <Redirect to="/login" />;
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
  if (userRole === "owner") return <Redirect to="/owner/dashboard" />;
  if (userRole === "admin") return <Redirect to="/admin/dashboard" />;
  if (userRole === "waiter") return <Redirect to="/waiter/tables" />;
  return <Redirect to="/login" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />

      {/* Public routes */}
      <Route path="/menu/:venueName" component={MenuPage} />

      {/* Owner routes */}
      <Route path="/owner/dashboard" component={() => <ProtectedRoute component={OwnerDashboard} role="owner" />} />
      <Route path="/owner/venues" component={() => <ProtectedRoute component={OwnerVenues} role="owner" />} />
      <Route path="/owner/venues/:id" component={() => <ProtectedRoute component={OwnerVenueDetail} role="owner" />} />
      <Route path="/owner/users" component={() => <ProtectedRoute component={OwnerUsers} role="owner" />} />

      {/* Admin routes */}
      <Route path="/admin/dashboard" component={() => <ProtectedRoute component={AdminDashboard} role="admin" />} />
      <Route path="/admin/pos" component={() => <ProtectedRoute component={AdminPos} role="admin" />} />
      <Route path="/admin/products" component={() => <ProtectedRoute component={AdminProducts} role="admin" />} />
      <Route path="/admin/rooms" component={() => <ProtectedRoute component={AdminRooms} role="admin" />} />
      <Route path="/admin/waiters" component={() => <ProtectedRoute component={AdminWaiters} role="admin" />} />
      <Route path="/admin/debts" component={() => <ProtectedRoute component={AdminDebts} role="admin" />} />
      <Route path="/admin/report" component={() => <ProtectedRoute component={AdminReport} role="admin" />} />

      {/* Waiter routes */}
      <Route path="/waiter/tables" component={() => <ProtectedRoute component={WaiterTables} role="waiter" />} />
      <Route path="/waiter/bookings" component={() => <ProtectedRoute component={WaiterBookings} role="waiter" />} />
      <Route path="/waiter/table/:tableId" component={() => <ProtectedRoute component={WaiterOrder} role="waiter" />} />

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
