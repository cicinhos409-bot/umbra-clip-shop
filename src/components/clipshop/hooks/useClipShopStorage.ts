import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { checkCompatibility } from "../services/compatibility";
import { clearAllClipShopData, clearTemporaryFiles, deleteProjectOutputs, getLocalStorageInfo } from "../services/project-storage";
import type { ClipShopProject, CompatibilityReport, LocalProjectStorageInfo } from "../types";

export function useClipShopStorage(
  projects: ClipShopProject[],
  setProjects: Dispatch<SetStateAction<ClipShopProject[]>>,
  setCompatibility: Dispatch<SetStateAction<CompatibilityReport | null>>,
) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<LocalProjectStorageInfo[]>([]);

  const refresh = useCallback(async () => {
    const [nextInfo, report] = await Promise.all([getLocalStorageInfo(projects), checkCompatibility()]);
    setInfo(nextInfo);
    setCompatibility(report);
  }, [projects, setCompatibility]);

  const openCenter = useCallback(async () => {
    setOpen(true);
    setInfo(await getLocalStorageInfo(projects));
  }, [projects]);

  const deleteOld = useCallback(async (projectId: string) => {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    await deleteProjectOutputs(projectId, cutoff);
    setInfo(await getLocalStorageInfo(projects));
  }, [projects]);

  const clearOutputs = useCallback(async (projectId: string) => {
    await deleteProjectOutputs(projectId);
    setInfo(await getLocalStorageInfo(projects));
  }, [projects]);

  const clearAll = useCallback(async () => {
    await clearAllClipShopData();
    setProjects([]);
    setInfo([]);
    setOpen(false);
  }, [setProjects]);

  return { open, info, openCenter, closeCenter: () => setOpen(false), refresh, deleteOld, clearOutputs, clearTemporary: clearTemporaryFiles, clearAll };
}
