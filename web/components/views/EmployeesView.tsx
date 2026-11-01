"use client";

import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Input, Modal, PageHeader, Pagination, Select, StatusBadge, Table, useToast } from "@/components/ui";
import { qs, useApi, type Paged } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, money } from "@/lib/format";
import { EmployeeForm, emptyEmployee } from "./EmployeeForm";

export default function EmployeesView() {
  const router = useRouter();
  const toast = useToast();
  const { currency } = useAuth();
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const { data: departments } = useApi<any[]>("/settings/departments");
  const { data, mutate } = useApi<Paged<any>>(`/employees${qs({ search, departmentId, status, page, pageSize: 20 })}`, { keepPreviousData: true });

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Employee master — add, edit and deactivate employees"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Add employee
          </Button>
        }
      />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search name, code or email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select className="w-52" value={departmentId} onChange={(e) => (setDepartmentId(e.target.value), setPage(1))}>
            <option value="">All departments</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select className="w-36" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ALL">All</option>
          </Select>
        </div>
        <Table
          rows={data?.items}
          rowKey={(e) => e.id}
          onRowClick={(e) => router.push(`/employees/${e.id}`)}
          columns={[
            { header: "Code", cell: (e) => <span className="font-mono text-xs">{e.employeeCode}</span> },
            {
              header: "Name",
              cell: (e) => (
                <div>
                  <p className="font-medium text-slate-900">
                    {e.firstName} {e.lastName}
                  </p>
                  <p className="text-xs text-slate-500">{e.email}</p>
                </div>
              ),
            },
            { header: "Department", cell: (e) => e.department.name },
            { header: "Designation", cell: (e) => e.designation.title },
            { header: "Shift", cell: (e) => e.shift.name },
            { header: "Joined", cell: (e) => formatDate(e.dateOfJoining) },
            { header: "Base salary", cell: (e) => money(e.baseSalary, currency), className: "text-right" },
            { header: "Status", cell: (e) => <StatusBadge status={e.status} /> },
          ]}
        />
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>

      <Modal open={creating} title="Add employee" onClose={() => setCreating(false)} wide>
        <EmployeeForm
          initial={emptyEmployee}
          onSaved={(e) => {
            setCreating(false);
            toast(`Employee ${e.employeeCode} created`);
            mutate();
            router.push(`/employees/${e.id}`);
          }}
        />
      </Modal>
    </>
  );
}
