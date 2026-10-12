import { useState, useEffect, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FolderOpen, Save, Trash2, Clock, Upload, Download } from 'lucide-react';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { toast } from 'sonner';
import { ScenarioListSkeleton } from '@/components/common/AppSkeletons';
import { cn } from '@/lib/utils';
import type { MediaPlanState } from '@/hooks/use-media-plan-store';
import type { MultiMonthState } from '@/hooks/use-multi-month-store';
import {
  loadSavedProjects,
  writeSavedProjects,
  writeErrorMessage,
  prepareProjectForLoad,
  exportProjectsJson,
  parseProjectsImport,
  mergeProjects,
  type SavedProject as Project,
} from '@/lib/saved-projects';

interface ProjectManagerProps {
  isDark?: boolean;
  triggerClassName?: string;
}

export function ProjectManager({ isDark = true, triggerClassName }: ProjectManagerProps) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  // Always read storage fresh: this component is mounted twice (header + dashboard), and a
  // list cached at mount made one copy overwrite projects saved from the other.
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readProjects = () => {
    const result = loadSavedProjects();
    if (result.notice) toast.warning(result.notice);
    return result;
  };

  // Storage first, state second: if the write fails nothing changes.
  const writeProjects = (list: Project[]): boolean => {
    const result = writeSavedProjects(list);
    if (!result.ok) {
      toast.error(writeErrorMessage(result.reason));
      return false;
    }
    setProjects(list);
    return true;
  };

  useEffect(() => {
    if (open) setProjects(readProjects().projects);
    setIsLoadingProjects(false);
  }, [open]);

  const saveProject = () => {
    const name = newProjectName.trim();
    if (!name) {
      toast.error('Please enter a project name');
      return;
    }

    const { projects: current, unsafeToSave } = readProjects();
    if (unsafeToSave) {
      toast.error('Saving is turned off because your existing projects could not be backed up.');
      return;
    }
    const existing = current.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing && !window.confirm(`A project called "${existing.name}" exists. Overwrite it?`)) {
      return;
    }

    const now = new Date().toISOString();
    const newProject: Project = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      mediaPlanState: useMediaPlanStore.getState() as unknown as Record<string, unknown>,
      multiMonthState: useMultiMonthStore.getState() as unknown as Record<string, unknown>,
    };

    if (!writeProjects([newProject, ...current.filter((p) => p.id !== newProject.id)])) return;
    setNewProjectName('');
    toast.success(existing ? 'Project updated' : 'Project saved in this browser');
  };

  const loadProject = (project: Project) => {
    const prepared = prepareProjectForLoad(project);
    if (!prepared.ok) {
      toast.error('This project is damaged and cannot be loaded. Your current plan was not changed.');
      return;
    }
    try {
      useMediaPlanStore.setState(prepared.mediaPlanState as Partial<MediaPlanState>);
      useMultiMonthStore.setState(prepared.multiMonthState as Partial<MultiMonthState>);

      toast.success(`Loaded project: ${project.name}`);
      setOpen(false);
    } catch (e) {
      console.error('Load failed', e);
      toast.error('Failed to load project');
    }
  };

  const exportAll = () => {
    const { projects: current } = readProjects();
    if (current.length === 0) {
      toast.info('There are no saved projects to export');
      return;
    }
    const blob = new Blob([exportProjectsJson(current)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mediaplanner-projects-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    const parsed = parseProjectsImport(await file.text());
    if (!parsed) {
      toast.error('That file is not a projects export. Nothing was imported.');
      return;
    }
    const { projects: current, unsafeToSave } = readProjects();
    if (unsafeToSave) {
      toast.error('Import is turned off because your existing projects could not be backed up.');
      return;
    }
    const { merged, added, duplicates } = mergeProjects(current, parsed.incoming);
    if (added > 0 && !writeProjects(merged)) return;
    const extras = [
      duplicates ? `${duplicates} already here` : '',
      parsed.skipped ? `${parsed.skipped} damaged and skipped` : '',
    ].filter(Boolean);
    toast.success(
      `Imported ${added} project${added === 1 ? '' : 's'}` +
        (extras.length ? ` (${extras.join(', ')})` : '')
    );
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering load
    const { projects: current, unsafeToSave } = readProjects();
    const target = current.find((p) => p.id === id);
    if (!target || !window.confirm(`Delete "${target.name}"? This cannot be undone.`)) return;
    if (unsafeToSave) {
      toast.error('Deleting is turned off because your existing projects could not be backed up.');
      return;
    }
    if (writeProjects(current.filter((p) => p.id !== id))) toast.info('Project deleted');
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'gap-2',
            isDark
              ? 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-200'
              : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-900',
            triggerClassName
          )}
        >
          <FolderOpen className={cn('h-4 w-4', isDark ? 'text-blue-400' : 'text-blue-600')} />
          My Projects
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] bg-[#0f172a] border-l border-slate-800 text-slate-100 sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Project Repository
          </SheetTitle>
          <SheetDescription className="text-slate-400">
            Save your current workspace state or load a previous session.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-8 space-y-6">
          {/* Save Section */}
          <div className="space-y-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Save className="h-4 w-4 text-emerald-400" />
              Save Current Workspace
            </h3>
            <div className="flex gap-2">
              <Input
                placeholder="Project Name (e.g. Q1 Aggressive Scale)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="bg-slate-950 border-slate-800 text-slate-200 focus-visible:ring-blue-500"
              />
              <Button onClick={saveProject} className="bg-blue-600 hover:bg-blue-700 text-white">
                Save
              </Button>
            </div>
          </div>

          {/* Project List */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              Recent Projects
            </h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportAll} className="gap-2">
                <Download className="h-4 w-4" />
                Export all
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Import
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                data-testid="import-projects-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void importFile(f);
                }}
              />
            </div>

            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {isLoadingProjects ? (
                <ScenarioListSkeleton />
              ) : projects.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm italic">
                  No saved projects found.
                </div>
              ) : (
                projects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => loadProject(project)}
                    className="group flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/40 hover:bg-slate-800/80 hover:border-slate-700 transition-all cursor-pointer"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-slate-200 group-hover:text-blue-300 transition-colors">
                        {project.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(project.updatedAt).toLocaleDateString()} •{' '}
                        {new Date(project.updatedAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-white"
                        title="Load Project"
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-950/30"
                        onClick={(e) => deleteProject(project.id, e)}
                        title="Delete Project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
