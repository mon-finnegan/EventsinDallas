-- New national interest: selectively opened places and moments (White House tours, landmark lotteries).
alter table events drop constraint if exists events_national_interest_check;
alter table events add constraint events_national_interest_check
  check (national_interest in ('golf','major_sports','olympics','special_experiences','exclusive_access'));
