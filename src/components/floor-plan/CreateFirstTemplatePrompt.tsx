import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface CreateFirstTemplatePromptProps {
  onCreate: () => void;
}

export function CreateFirstTemplatePrompt({ onCreate }: CreateFirstTemplatePromptProps) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center p-8 text-center">
      <p className="text-muted-foreground mb-4">You haven&apos;t created any templates yet</p>
      <Button variant="outline" onClick={onCreate} className="flex items-center gap-2">
        <Plus className="size-4" />
        Create Your First Template
      </Button>
    </div>
  );
}
