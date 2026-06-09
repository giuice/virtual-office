import { toast } from 'sonner';
const showToast = ({
  title,
  description,
  variant = 'default',
  duration = 5000
}: ToastOptions) => {
  if (variant === 'destructive') {
    toast.error(description, {
      duration
    });
  } else {
    toast(title || description, {
      description: title ? description : undefined,
      duration
    });
  }
};
interface ToastOptions {
  title?: string;
  description: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}
export const useToast = () => {
  return {
    toast: showToast
  };
};
