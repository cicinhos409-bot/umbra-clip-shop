import { useCallback, useEffect, useRef, useState } from "react";
import { saveProject } from "../services/project-storage";
import type { ClipShopProject } from "../types";

export type ClipShopSaveState = "idle" | "saving" | "saved" | "error";
export type ProjectChange = Partial<ClipShopProject> | ((value: ClipShopProject) => ClipShopProject);

export function useClipShopProject() {
  const [projects, setProjects] = useState<ClipShopProject[]>([]);
  const [project, setProject] = useState<ClipShopProject | null>(null);
  const [saveState, setSaveState] = useState<ClipShopSaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [saveRetryKey, setSaveRetryKey] = useState(0);
  const saveRevisionRef = useRef(0);

  useEffect(() => {
    const revision = ++saveRevisionRef.current;
    if (!project) { setSaveState("idle"); setSaveError(""); return; }
    setSaveState("saving");
    setSaveError("");
    const timer = window.setTimeout(async () => {
      try {
        await saveProject(project);
        if (revision !== saveRevisionRef.current) return;
        setProjects((rows) => [project, ...rows.filter((item) => item.id !== project.id)]);
        setSaveState("saved");
      } catch (cause) {
        if (revision !== saveRevisionRef.current) return;
        setSaveError(cause instanceof Error ? cause.message : "Não foi possível salvar o projeto localmente.");
        setSaveState("error");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [project, saveRetryKey]);

  const updateProject = useCallback((change: ProjectChange) => setProject((current) => {
    if (!current) return current;
    const next = typeof change === "function" ? change(current) : { ...current, ...change };
    return { ...next, updatedAt: new Date().toISOString() };
  }), []);

  const retrySave = useCallback(() => setSaveRetryKey((value) => value + 1), []);

  return { projects, setProjects, project, setProject, updateProject, saveState, saveError, retrySave };
}
