import { PageHeader } from "@/components/ui";
import { ServiceTabs } from "@/components/services/tabs";

/** Единое окно глазами деканата: сводка для руководства и настройки услуг, приём. */
export default function StaffServicesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Услуги" subtitle="Единое окно: как работают услуги деканата, настройки сроков и автовыдачи, кто записан на приём" />
      <ServiceTabs
        tabs={[
          { href: "/staff/services", label: "Сводка и настройки" },
          { href: "/staff/services/appointments", label: "Приём" },
        ]}
      />
      {children}
    </>
  );
}
