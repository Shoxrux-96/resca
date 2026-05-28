import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListVenues,
  useCreateVenue,
  useDeleteVenue,
  type VenueInputType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListVenuesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Store, ChevronRight, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function OwnerVenues() {
  const [, setLocation] = useLocation();
  const { data: venues, isLoading } = useListVenues();
  const createVenue = useCreateVenue();
  const deleteVenue = useDeleteVenue();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "cafe" as VenueInputType, address: "", phone: "" });

  const handleCreate = () => {
    createVenue.mutate(
      { data: { name: form.name, type: form.type, address: form.address || undefined, phone: form.phone || undefined } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListVenuesQueryKey() });
          setOpen(false);
          setForm({ name: "", type: "cafe", address: "", phone: "" });
          toast({ title: "Filial qo'shildi" });
        },
        onError: () => toast({ title: "Xatolik", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Filialni o'chirishni tasdiqlaysizmi?")) return;
    deleteVenue.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListVenuesQueryKey() });
          toast({ title: "Filial o'chirildi" });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Cafe va restoranlar</h1>
          <p className="text-muted-foreground mt-1 text-sm">Barcha cafe va restoranlar</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700 shrink-0" size="sm">
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Yangi Filial</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Yuklanmoqda...</div>
      ) : !venues?.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <Store className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-muted-foreground">Hali filial yo'q</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {venues.map((venue) => (
            <Card
              key={venue.id}
              onClick={() => setLocation(`/owner/venues/${venue.id}`)}
              className="bg-card border-border hover:border-blue-700 cursor-pointer transition-colors"
            >
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center">
                    <Store className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle className="text-foreground text-lg">{venue.name}</CardTitle>
                    <Badge variant="outline" className="mt-1 text-xs capitalize border-border text-muted-foreground">
                      {venue.type === "cafe" ? "Kafe" : "Restoran"}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:bg-red-500/10"
                    onClick={(e) => handleDelete(venue.id, e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                {venue.address && <p className="text-sm text-muted-foreground">{venue.address}</p>}
                {venue.phone && <p className="text-sm text-muted-foreground">{venue.phone}</p>}
                {venue.adminName ? (
                  <p className="text-sm text-foreground mt-2">Admin: <span className="text-blue-400">{venue.adminName}</span></p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-2">Admin tayinlanmagan</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Yangi Filial Qo'shish</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nomi</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Filial nomi"
                className="bg-input border-border mt-1"
              />
            </div>
            <div>
              <Label>Turi</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as VenueInputType })}>
                <SelectTrigger className="bg-input border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-input border-border">
                  <SelectItem value="cafe">Kafe</SelectItem>
                  <SelectItem value="restaurant">Restoran</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Manzil</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Manzil (ixtiyoriy)"
                className="bg-input border-border mt-1"
              />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+998901234567 (ixtiyoriy)"
                className="bg-input border-border mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Bekor qilish</Button>
            <Button
              onClick={handleCreate}
              disabled={!form.name || createVenue.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createVenue.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
