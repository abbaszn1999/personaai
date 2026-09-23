import { redirect } from "next/navigation";
import { AccountPage } from "@/modules/settings/components/account-page";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  if (params.section === "billing") {
    const forward = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "section" || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) forward.append(key, item);
    }
    const query = forward.toString();
    redirect(query ? `/settings/billing?${query}` : "/settings/billing");
  }
  return <AccountPage />;
}
