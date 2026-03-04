import { Injectable } from '@angular/core';
import { ProjectModel } from './project.model';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private LS_KEY = 'projects_data';

  getProjects(): ProjectModel[] {
    const data = localStorage.getItem(this.LS_KEY);
    return data ? JSON.parse(data) : [];
  }

  saveProject(project: Omit<ProjectModel, 'id'>): void {
    const projects = this.getProjects();
    const newProject = { ...project, id: crypto.randomUUID() };
    localStorage.setItem(this.LS_KEY, JSON.stringify([...projects, newProject]));
  }

  deleteProject(id: string): void {
    const filtered = this.getProjects().filter((p) => p.id !== id);
    localStorage.setItem(this.LS_KEY, JSON.stringify(filtered));
  }
}
