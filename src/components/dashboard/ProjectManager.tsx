import { useState, useEffect } from 'react';
import { z } from 'zod';
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
import { FolderOpen, Save, Trash2, Clock, Upload } from 'lucide-react';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { toast } from 'sonner';
import { ScenarioListSkeleton } from '@/components/common/AppSkeletons';
import { cn } from '@/lib/utils';
import type { MediaPlanState } from '@/hooks/use-media-plan-store';
import type { MultiMonthState } from '@/hooks/use-multi-month-store';

interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  mediaPlanState: unknown;
  multiMonthState: unknown;
}

const STORAGE_KEY = 'igaming_projects';

// Zod schema for validating Project data from localStorage
const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  mediaPlanState: z.unknown(),
  multiMonthState: z.unknown(),
});

const ProjectListSchema = z.array(ProjectSchema);

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
  const readProjects = (): Project[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const validated = ProjectListSchema.safeParse(JSON.parse(stored));
      if (!validated.success) {
        console.warn('Invalid projects schema in localStorage:', validated.error);
        return [];
      }
      return validated.data;
    } catch (e) {
      console.error('Failed to read projects from localStorage', e);
      return [];
    }
  };

  const writeProjects = (list: Project[]) => {
    setProjects(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      toast.error('Could not save: browser storage is full or blocked');
    }
  };

  useEffect(() => {
    if (open) setProjects(readProjects());
    setIsLoadingProjects(false);
  }, [open]);

  const saveProject = () => {
    const name = newProjectName.trim();
    if (!name) {
      toast.error('Please enter a project name');
      return;
    }

    const current = readProjects();
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
      mediaPlanState: useMediaPlanStore.getState(),
      multiMonthState: useMultiMonthStore.getState(),
    };

    writeProjects([newProject, ...current.filter((p) => p.id !== newProject.id)]);
    setNewProjectName('');
    toast.success(existing ? 'Project updated' : 'Project saved in this browser');
  };

  const loadProject = (project: Project) => {
    try {
      // Account/access fields come from the signed-in user, never from a saved file.
      const {
        subscriptionTier: _tier,
        userStatus: _status,
        ...planState
      } = project.mediaPlanState as Partial<MediaPlanState>;
      useMediaPlanStore.setState(planState);
      useMultiMonthStore.setState(project.multiMonthState as Partial<MultiMonthState>);

      toast.success(`Loaded project: ${project.name}`);
      setOpen(false);
    } catch (e) {
      console.error('Load failed', e);
      toast.error('Failed to load project');
    }
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering load
    const target = readProjects().find((p) => p.id === id);
    if (!target || !window.confirm(`Delete "${target.name}"? This cannot be undone.`)) return;
    writeProjects(readProjects().filter((p) => p.id !== id));
    toast.info('Project deleted');
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
