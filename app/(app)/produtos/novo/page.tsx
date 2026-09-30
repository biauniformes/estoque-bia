import { requireAdmin } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ProductForm } from "@/components/produtos/product-form";

export const metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Novo produto" />
      <Card className="max-w-3xl">
        <CardContent className="pt-5">
          <ProductForm />
        </CardContent>
      </Card>
    </>
  );
}
