export type AppView = 'warehouse' | 'assistant' | 'profile';

export interface AppViewMeta {
  id: AppView;
  label: string;
  description: string;
}

export const APP_VIEWS: AppViewMeta[] = [
  { id: 'warehouse', label: 'Almacén', description: 'Gemelo digital 3D en vivo' },
  { id: 'assistant', label: 'Asistente IA', description: 'Preguntas sobre la operación' },
  { id: 'profile', label: 'Perfil', description: 'Tu cuenta y actividad' },
];
