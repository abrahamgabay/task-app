-- Subtasks: the steps of a task, shown as a checklist on the task's page.
--
-- Each step belongs to one task. Deleting the task deletes its steps (on delete
-- cascade). The user can type steps in, and the Edge Function suggest-subtasks
-- can add steps that the AI suggests.
create table public.subtasks (
  subtask_id uuid default gen_random_uuid() primary key,
  task_id uuid not null references public.tasks on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  completed boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- The task page loads a task's steps by task_id.
create index subtasks_task_id_idx on public.subtasks (task_id);

-- Security policy: Users can CRUD their own subtasks, and only on their own tasks
create policy "Users can CRUD own subtasks"
on public.subtasks for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.tasks
    where tasks.task_id = subtasks.task_id and tasks.user_id = auth.uid()
  )
);

-- Enable RLS
alter table public.subtasks enable row level security;

-- Signed-in users reach the table through the Data API; Row Level Security then
-- limits them to their own rows.
grant select, insert, update, delete on public.subtasks to authenticated;
