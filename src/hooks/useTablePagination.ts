import { useState, useEffect } from 'react';

export function useTablePagination(defaultOffset = 380, rowHeight = 60) {
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    const calculate = () => {
      // Offset subtracts the height of topbar, headers, filtering area, table header and paginator.
      const availableHeight = window.innerHeight - defaultOffset;
      const count = Math.max(5, Math.floor(availableHeight / rowHeight));
      setItemsPerPage(count);
    };

    calculate();
    window.addEventListener('resize', calculate);
    
    return () => window.removeEventListener('resize', calculate);
  }, [defaultOffset, rowHeight]);

  return itemsPerPage;
}
