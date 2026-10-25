import { useToast } from '../components/ui/Toast.jsx';

export function useQuickAdd() {
  const toast = useToast();
  return () => toast.show('Quick add isn’t built yet.');
}
