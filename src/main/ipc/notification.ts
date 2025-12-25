import { IPC_CHANNELS } from '@shared/types';
import { ipcMain, Notification } from 'electron';

interface NotificationOptions {
  title: string;
  body?: string;
  silent?: boolean;
}

export function registerNotificationHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION_SHOW,
    async (_, options: NotificationOptions): Promise<void> => {
      if (!Notification.isSupported()) {
        return;
      }

      const notification = new Notification({
        title: options.title,
        body: options.body,
        silent: options.silent ?? false,
      });

      notification.show();
    }
  );
}
