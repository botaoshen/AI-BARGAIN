-- Create a table for user profiles
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  tier text default 'free',
  search_credits integer default 5, -- Free users get 5 searches initially
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_end timestamp with time zone,
  current_period_end timestamp with time zone
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Create policies
create policy "Users can view own profile"
  on public.profiles for select
  using ( auth.uid() = id );

-- Trigger to create profile on signup
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
