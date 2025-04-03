import { toast } from 'sonner';

interface ToastOptions {
  title?: string;
  description: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}

export const useToast = () => {
  const showToast = ({ title, description, variant = 'default', duration = 5000 }: ToastOptions) => {
    if (variant === 'destructive') {
      toast.error(description, {
        duration,
      });
    } else {
      toast(title || description, {
        description: title ? description : undefined,
        duration,
      });
    }
  };

  return {
    toast: showToast,
  };
};