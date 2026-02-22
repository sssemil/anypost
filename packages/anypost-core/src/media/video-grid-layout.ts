type GridLayout = {
  readonly columns: number;
  readonly rows: number;
};

export const getGridLayout = (participantCount: number): GridLayout => {
  if (participantCount <= 0) return { columns: 0, rows: 0 };
  if (participantCount === 1) return { columns: 1, rows: 1 };
  if (participantCount === 2) return { columns: 2, rows: 1 };

  const columns = Math.ceil(Math.sqrt(participantCount));
  const rows = Math.ceil(participantCount / columns);
  return { columns, rows };
};
