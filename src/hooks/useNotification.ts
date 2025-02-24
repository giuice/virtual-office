// src/hooks/useNotification.ts
import { toast } from 'sonner';

interface NotificationOptions {
  title?: string;
  description: string;
}

export const useNotification = () => {
  const showSuccess = ({ title, description }: NotificationOptions) => {
    if (title) {
      toast.success(title, {
        description,
      });
    } else {
      toast.success(description);
    }
  };

  const showError = ({ title, description }: NotificationOptions) => {
    if (title) {
      toast.error(title, {
        description,
      });
    } else {
      toast.error(description);
    }
  };

  return {
    showSuccess,
    showError,
  };
};