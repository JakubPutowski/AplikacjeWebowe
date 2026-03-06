import { Component, signal, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectService } from './project';
import { ProjectModel } from './project.model';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { CommonModule } from '@angular/common';
import { Story } from './project.model';
import { StoryPriority } from './project.model';
import { StoryState } from './project.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSelectModule,
    MatOptionModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private projectService = inject(ProjectService);

  currentUser = this.projectService.getCurrentUser();
  currentProjectId = signal<string | null>(null);

  projects = signal<ProjectModel[]>([]);

  stories = signal<Story[]>([]);

  projectName = '';
  projectDesc = '';

  storyName = '';
  storyDesc = '';
  storyPriority: StoryPriority = 'średni';

  ngOnInit() {
    this.refreshList();

    const savedProjectId = this.projectService.getCurrentProjectId();

    if (savedProjectId) {
      this.currentProjectId.set(savedProjectId);
      this.refreshStories();
    }
  }

  refreshList() {
    this.projects.set(this.projectService.getProjects());
  }

  refreshStories() {
    const pId = this.currentProjectId();
    if (pId) {
      this.stories.set(this.projectService.getStoriesForProject(pId));
    } else {
      this.stories.set([]);
    }
  }

  addProject() {
    if (this.projectName.trim()) {
      this.projectService.saveProject({
        name: this.projectName,
        description: this.projectDesc,
      });

      this.projectName = '';
      this.projectDesc = '';

      this.refreshList();
    }
  }

  deleteProject(id: string) {
    this.projectService.deleteProject(id);
    this.refreshList();
  }

  selectProject(id: string) {
    this.projectService.setCurrentProjectId(id);
    this.currentProjectId.set(id);
    this.refreshStories();
  }

  getActiveProjectName() {
    return this.projects().find((p) => p.id === this.currentProjectId())?.name;
  }

  addStory() {
    const pId = this.currentProjectId();

    if (this.storyName.trim() && pId) {
      this.projectService.addStory({
        name: this.storyName,
        description: this.storyDesc,
        priority: this.storyPriority,
        projectId: pId,
        state: 'todo',
        ownerId: this.currentUser.id,
      });

      this.storyName = '';
      this.storyDesc = '';
      this.storyPriority = 'średni';
      this.refreshStories();
    }
  }

  removeStory(storyId: string) {
    if (confirm('Czy na pewno chcesz usunąć tę historyjkę?')) {
      this.projectService.deleteStory(storyId);
      this.refreshStories();
    }
  }

  changeState(story: Story, newState: StoryState) {
    const allStories = this.projectService.getStories();

    const index = allStories.findIndex((s) => s.id === story.id);
    if (index !== -1) {
      allStories[index].state = newState;

      localStorage.setItem('stories_data', JSON.stringify(allStories));

      this.refreshStories();
    }
  }

  getStoriesByState(state: StoryState) {
    return this.stories().filter((s) => s.state === state);
  }
}
