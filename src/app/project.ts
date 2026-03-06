import { Injectable } from '@angular/core';
import { ProjectModel } from './project.model';
import { User } from './project.model';
import { Story } from './project.model';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private LS_KEY = 'projects_data';
  private STORIES_KEY = 'stories_data';
  private CURRENT_PROJ_KEY = 'current_project_id';

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

  getCurrentUser(): User {
    return { id: 'u1', firstName: 'Jakub', lastName: 'Putowski' };
  }

  setCurrentProjectId(id: string): void {
    localStorage.setItem(this.CURRENT_PROJ_KEY, id);
  }

  getCurrentProjectId(): string | null {
    return localStorage.getItem(this.CURRENT_PROJ_KEY);
  }

  getStories(): Story[] {
    const data = localStorage.getItem(this.STORIES_KEY);
    return data ? JSON.parse(data) : [];
  }

  getStoriesForProject(projectId: string): Story[] {
    return this.getStories().filter((s) => s.projectId === projectId);
  }

  addStory(story: Omit<Story, 'id' | 'createdAt'>): void {
    const all = this.getStories();
    const newStory: Story = {
      ...story,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };
    localStorage.setItem(this.STORIES_KEY, JSON.stringify([...all, newStory]));
  }

  deleteStory(storyId: string): void {
    const allStories = this.getStories();
    const filtered = allStories.filter((s) => s.id !== storyId);
    localStorage.setItem(this.STORIES_KEY, JSON.stringify(filtered));
  }
}
