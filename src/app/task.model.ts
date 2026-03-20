export type TaskPriority = 'niski' | 'średni' | 'wysoki';
export type TaskState = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  name: string;
  description: string;
  priority: TaskPriority;

  // Powiązanie z historyjką (story).
  storyId: string;

  // Przewidywany czas wykonania (w godzinach).
  expectedHours: number;

  state: TaskState;

  // ISO stringi (bo lokalnie zapisujemy do localStorage jako JSON).
  addedAt: string;
  startAt: string | null;
  endAt: string | null;

  // Zrealizowane roboczogodziny (w godzinach) - ustawiane przy przejściu na done.
  actualHours: number | null;

  // Osoba realizująca zadanie (devops/developer) - obowiązkowo przy doing/done.
  responsibleUserId: string | null;
}

