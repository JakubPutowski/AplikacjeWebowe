import { Component, signal, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectService } from './project';
import { ProjectModel } from './project.model';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private projectService = inject(ProjectService);

  projects = signal<ProjectModel[]>([]);

  projectName = '';
  projectDesc = '';

  ngOnInit() {
    this.refreshList();
  }

  refreshList() {
    this.projects.set(this.projectService.getProjects());
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
}
