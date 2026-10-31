import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function useOpenItem() {
  const navigate = useNavigate();
  const location = useLocation();

  const itemLink = useCallback(
    (id) => {
      const params = new URLSearchParams(location.search);
      params.set('item', id);
      return { pathname: location.pathname, search: `?${params.toString()}` };
    },
    [location.pathname, location.search]
  );

  const openItem = useCallback(
    (id) => {
      const alreadyOpen = new URLSearchParams(location.search).has('item');
      navigate(itemLink(id), { state: { fromList: true }, replace: alreadyOpen });
    },
    [navigate, itemLink, location.search]
  );

  const closeItem = useCallback(() => {
    if (location.state?.fromList) navigate(-1);
    else {
      const params = new URLSearchParams(location.search);
      params.delete('item');
      const search = params.toString();
      navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
    }
  }, [navigate, location]);

  return { openItem, closeItem, itemLink };
}
