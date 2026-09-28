import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { ChipDraft } from '../domain/types';

export function useCalendar(divisionId: string | undefined, date: string, isToday: boolean) {
  return useQuery({
    queryKey: ['calendar', divisionId, date],
    queryFn: () => api.getCalendar(divisionId, date),
    refetchInterval: isToday ? 15_000 : false,
  });
}

export function useMasters(divisionId: string | undefined) {
  return useQuery({
    queryKey: ['masters', divisionId],
    queryFn: () => api.getMasters(divisionId),
    staleTime: 60_000,
  });
}

export function useJobCard(jobCardId: string | null | undefined) {
  return useQuery({
    queryKey: ['job-card', jobCardId],
    queryFn: () => (jobCardId ? api.getJobCard(jobCardId) : null),
    enabled: !!jobCardId,
  });
}

export function useBaySequence(bayId: string | undefined, date: string, durationMin: number) {
  return useQuery({
    queryKey: ['bay-seq', bayId, date, durationMin],
    queryFn: () => api.getBaySequence(bayId, date, durationMin),
    enabled: !!bayId,
  });
}

export function useUnassignedJobs(divisionId: string | undefined, date: string) {
  return useQuery({
    queryKey: ['unassigned-jobs', divisionId, date],
    queryFn: () => api.unassignedJobs(divisionId, date),
    refetchInterval: 15_000,
  });
}

export function useStatusBoard(divisionId: string | undefined) {
  return useQuery({
    queryKey: ['status-board', divisionId],
    queryFn: () => api.getStatusBoard(divisionId),
    refetchInterval: 15_000,
  });
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api.search(query),
    enabled: query.length >= 2,
  });
}

export function useCreateChips() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      chips: ChipDraft[];
      confirm_ptd_warning?: boolean;
      washing_required?: boolean;
      prewash_done?: boolean;
    }) => api.createChips(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['unassigned-jobs'] });
      qc.invalidateQueries({ queryKey: ['job-card'] });
      qc.invalidateQueries({ queryKey: ['status-board'] });
    },
  });
}

export function useReschedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      chipId: string;
      body: { planned_start: string; planned_end: string; confirm_ptd_warning?: boolean };
    }) => api.rescheduleChip(vars.chipId, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['bay-seq'] });
      qc.invalidateQueries({ queryKey: ['status-board'] });
    },
  });
}

export function useChipAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      chipId: string;
      action: string;
      body: { pause?: any; delay_reason?: string | null };
    }) => api.chipAction(vars.chipId, vars.action, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['status-board'] });
      qc.invalidateQueries({ queryKey: ['job-card'] });
    },
  });
}
