import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface CurrentUser {
  sub: string;
  name: string;
  email: string | null;
  app: string;
  jobsAppUrl: string;
}

interface Skill {
  id: number;
  name: string;
  level: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly user = signal<CurrentUser | null>(null);
  protected readonly skills = signal<Skill[]>([]);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    // withCredentials tells the browser to attach the session cookie.
    // Without it every request is anonymous, however correct the
    // backend happens to be.
    this.http
      .get<CurrentUser>('/api/me', { withCredentials: true })
      .subscribe({
        next: (user) => {
          this.user.set(user);
          this.loadSkills();
          this.loading.set(false);
        },
        error: () => {
          this.user.set(null);
          this.loading.set(false);
        },
      });
  }

  private loadSkills(): void {
    this.http
      .get<{ skills: Skill[] }>('/api/my/skills', { withCredentials: true })
      .subscribe((response) => this.skills.set(response.skills));
  }
}
