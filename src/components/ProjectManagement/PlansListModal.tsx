import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, ExternalLink } from "lucide-react";
import { Modal } from "../../themes/uiComponents";
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from "../../themes/designTokens";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../lib/store";
import { listPlans, deletePlan, type PlanRow } from "../../lib/plansService";
import { format } from "date-fns";

interface PlansListModalProps {
  onClose: () => void;
}

export default function PlansListModal({ onClose }: PlansListModalProps) {
  const { t } = useTranslation("project");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = useAuthStore((s) => s.getCompanyId());
  const profile = useAuthStore((s) => s.profile);

  const canEdit = profile?.role === "Admin" || profile?.role === "boss" || profile?.role === "project_manager";

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["plans", companyId],
    queryFn: () => listPlans(supabase, companyId!),
    enabled: !!companyId,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ planId }: { planId: string }) =>
      deletePlan(supabase, planId, companyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans", companyId] });
    },
  });

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleOpen = (plan: PlanRow) => {
    onClose();
    navigate(`/project-management/create-canvas/${plan.id}`);
  };

  const handleDelete = (plan: PlanRow) => {
    if (!canEdit) return;
    if (!confirm(t("plans_delete_confirm", { title: plan.title }))) return;
    deleteMutation.mutate({ planId: plan.id });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "d MMM yyyy, HH:mm");
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={t("plans_list_title")} width={560}>
      <p
        style={{
          fontSize: fontSizes.sm,
          color: colors.textDim,
          fontFamily: fonts.body,
          marginBottom: spacing["5xl"],
        }}
      >
        {t("plans_canvases_description")}
      </p>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: spacing["6xl"], color: colors.textDim }}>
          {t("loading_data")}
        </div>
      ) : plans.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: spacing["6xl"],
            color: colors.textDim,
            fontSize: fontSizes.base,
          }}
        >
          {t("plans_empty")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.base }}>
          {plans.map((plan) => (
            <div
              key={plan.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: spacing["5xl"],
                borderRadius: radii.lg,
                border: `1px solid ${colors.borderLight}`,
                background: colors.bgSubtle,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: fontWeights.semibold,
                    color: colors.textPrimary,
                    fontFamily: fonts.display,
                    marginBottom: 4,
                  }}
                >
                  {plan.title || t("plans_untitled")}
                </div>
                <div
                  style={{
                    fontSize: fontSizes.sm,
                    color: colors.textDim,
                  }}
                >
                  {t("plans_updated")}: {formatDate(plan.updated_at)}
                </div>
              </div>
              <div style={{ display: "flex", gap: spacing.base, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => handleOpen(plan)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 16px",
                    background: colors.accentBlue,
                    color: colors.textOnAccent,
                    border: "none",
                    borderRadius: radii.md,
                    fontSize: fontSizes.sm,
                    fontWeight: fontWeights.medium,
                    cursor: "pointer",
                    fontFamily: fonts.body,
                  }}
                >
                  <ExternalLink size={16} />
                  {t("plans_open")}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDelete(plan)}
                    disabled={deleteMutation.isPending}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 16px",
                      background: "transparent",
                      color: colors.red,
                      border: `1px solid ${colors.red}`,
                      borderRadius: radii.md,
                      fontSize: fontSizes.sm,
                      fontWeight: fontWeights.medium,
                      cursor: deleteMutation.isPending ? "not-allowed" : "pointer",
                      fontFamily: fonts.body,
                      opacity: deleteMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    <Trash2 size={16} />
                    {t("plans_delete")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
