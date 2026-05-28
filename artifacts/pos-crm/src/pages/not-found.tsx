import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  useEffect(() => { document.title = "404 Sahifa topilmadi — resca.uz"; }, []);
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4 bg-card border-border">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-foreground">404 Sahifa topilmadi</h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Siz qidirayotgan sahifa mavjud emas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
