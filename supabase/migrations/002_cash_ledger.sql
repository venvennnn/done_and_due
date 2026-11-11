-- Cashflow figures live in workspaces.state.cash. This view exposes them
-- without rewriting existing invoice rows.
create or replace view public.workspace_cash as
select
  id as workspace_id,
  state -> 'cash' as cash
from public.workspaces
where state ? 'cash';
