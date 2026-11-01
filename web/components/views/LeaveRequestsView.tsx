"use client";

import { Check, Search, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pagination, Select, StatusBadge, Table, Textarea, useToast } from "@/components/ui";
import { api, errorMessage, qs, useApi, type Paged } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";

export default function LeaveRequestsView() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState<{ request: any; approve: boolean } | null>(null);
  const [comment, setComment] = useState("");
  const [allocating, setAllocating] = useState(false);
  const [allocYear, setAllocYear] = useState(new Date().getFullYear() + 1);

  const { data, mutate } = useApi<Paged<any>>(`/leave/requests${qs({ status, search, page, pageSize: 20 })}`, { keepPreviousData: true });

  async function review() {
    if (!reviewing) return;
    try {
      await api(`/leave/requests/${reviewing.request.id}/${reviewing.approve ? "approve" : "reject"}`, { body: { comment: comment || undefined } });
      toast(reviewing.approve ? "Leave approved — attendance updated" : "Leave rejected");
      setReviewing(null);
      setComment("");
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function cancel(id: number) {
    if (!confirm("Cancel this approved leave? The balance will be restored and attendance recalculated.")) return;
    try {
      await api(`/leave/requests/${id}/cancel`, { method: "POST" });
      toast("Leave cancelled");
      mutate();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function allocate() {
    try {
      const r = await api("/leave/balances/allocate", { body: { year: allocYear } });
      toast(`Allocated ${r.created} leave balances for ${r.year} (with carry-forward)`);
      setAllocating(false);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Leave requests"
        subtitle="Review and approve or reject employee leave applications"
        actions={
          isAdmin && (
            <Button variant="secondary" onClick={() => setAllocating(true)}>
              Allocate yearly balances
            </Button>
          )
        }
      />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <Select className="w-44" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="ALL">All</option>
          </Select>
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder="Search employee" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} />
          </div>
        </div>
        <Table
          rows={data?.items}
          rowKey={(r) => r.id}
          empty={status === "PENDING" ? "No pending requests — all caught up." : "No requests found"}
          columns={[
            {
              header: "Employee",
              cell: (r) => (
                <div>
                  <p className="font-medium text-slate-900">
                    {r.employee.firstName} {r.employee.lastName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.employee.employeeCode} · {r.employee.department.name}
                  </p>
                </div>
              ),
            },
            {
              header: "Type",
              cell: (r) => (
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.leaveType.color }} />
                  {r.leaveType.name}
                  {!r.leaveType.isPaid && <Badge tone="amber">Unpaid</Badge>}
                </span>
              ),
            },
            { header: "Dates", cell: (r) => (r.startDate === r.endDate ? formatDate(r.startDate) : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`) },
            { header: "Days", cell: (r) => (r.isHalfDay ? "½" : r.days) },
            { header: "Reason", cell: (r) => <span className="block max-w-56 truncate text-slate-500" title={r.reason}>{r.reason}</span> },
            { header: "Applied", cell: (r) => <span className="text-xs text-slate-500">{formatDateTime(r.createdAt)}</span> },
            {
              header: "Status",
              cell: (r) => (
                <div>
                  <StatusBadge status={r.status} />
                  {r.reviewComment && <p className="mt-0.5 max-w-40 truncate text-xs text-slate-400" title={r.reviewComment}>{r.reviewComment}</p>}
                </div>
              ),
            },
            {
              header: "",
              cell: (r) =>
                r.status === "PENDING" ? (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="success"
                      className="w-8 px-0"
                      title="Approve"
                      aria-label={`Approve leave for ${r.employee.firstName} ${r.employee.lastName}`}
                      onClick={() => setReviewing({ request: r, approve: true })}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      className="w-8 px-0"
                      title="Reject"
                      aria-label={`Reject leave for ${r.employee.firstName} ${r.employee.lastName}`}
                      onClick={() => setReviewing({ request: r, approve: false })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : r.status === "APPROVED" ? (
                  <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>
                    Cancel
                  </Button>
                ) : null,
            },
          ]}
        />
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}
      </Card>

      <Modal
        open={!!reviewing}
        title={reviewing?.approve ? "Approve leave" : "Reject leave"}
        onClose={() => setReviewing(null)}
        footer={
          <Button variant={reviewing?.approve ? "success" : "danger"} onClick={review} disabled={!reviewing?.approve && comment.trim().length < 3}>
            {reviewing?.approve ? "Approve" : "Reject"}
          </Button>
        }
      >
        {reviewing && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {reviewing.request.employee.firstName} {reviewing.request.employee.lastName} · {reviewing.request.leaveType.name} · {reviewing.request.days} day(s)
              <br />
              <span className="text-slate-500">“{reviewing.request.reason}”</span>
            </p>
            <Field label={reviewing.approve ? "Comment (optional)" : "Reason for rejection *"}>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal open={allocating} title="Allocate leave balances" onClose={() => setAllocating(false)} footer={<Button onClick={allocate}>Allocate</Button>}>
        <p className="mb-4 text-sm text-slate-600">
          Creates balances for every active employee using each leave type&apos;s yearly quota. Unused balance from the previous year is carried forward where the leave type allows it (up to its maximum). Existing balances are not changed.
        </p>
        <Field label="Leave year">
          <Input type="number" value={allocYear} onChange={(e) => setAllocYear(Number(e.target.value))} />
        </Field>
      </Modal>
    </>
  );
}
