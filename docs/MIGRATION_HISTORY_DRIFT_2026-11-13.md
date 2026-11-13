# AthleteN migration-history timestamp drift — 2026-11-13

## Result

This is a timestamp comparison, not a filename-stem or SQL-equivalence comparison. The Supabase CLI documentation states that `supabase migration list` compares migration timestamps between `supabase/migrations` and `supabase_migrations.schema_migrations`; it does not match migrations by SQL contents or descriptive name.

- Production remote ledger: **177** versions.
- Repository local SQL files: **113**.
- Unique local timestamp prefixes: **96**.
- Exact timestamps present both locally and remotely: **24**.
- Remote timestamps with no matching local file: **153**.
- Local timestamps not recorded in remote history: **72**.
- Duplicate local timestamp groups: **5** groups containing 22 files.
- Local files with non-14-digit timestamp prefixes: **19**.

A name-based match is not sufficient to clear this blocker. A migration file with the wrong timestamp is still unmatched to the CLI even if its SQL or suffix appears equivalent.

## Remote versions missing locally

| Remote timestamp | Remote migration name |
|---|---|
| `20260823165636` | `harden_rls_and_security_20260823` |
| `20260823165951` | `consolidate_duplicate_rls_policies_20260823` |
| `20260823170951` | `atomic_ai_quota_and_prompt_limits_20260823` |
| `20260823171337` | `atomic_ai_usage_reservation` |
| `20260823171406` | `return_ai_usage_reservation_id` |
| `20260823172934` | `fix_profile_onboarding_rls_20260823` |
| `20260823173006` | `fix_profile_trigger_admin_helper_20260823` |
| `20260824085740` | `consolidate_rls_and_lockdown_rpc_access` |
| `20260824085752` | `harden_backend_ai_quota_rpc` |
| `20260824090123` | `remove_client_security_definer_ai_paths` |
| `20260824090341` | `tighten_private_function_privileges` |
| `20260824092227` | `fix_profile_save_trigger_privileges` |
| `20260824092249` | `allow_rls_admin_helper_for_auth` |
| `20260824092714` | `remove_unused_advisor_indexes_20260824` |
| `20260824122933` | `add_safe_ai_usage_cancellation` |
| `20260824123018` | `harden_ai_usage_cancellation` |
| `20260912053044` | `enable_private_file_storage` |
| `20260912055818` | `set_upload_size_limit_5mb` |
| `20260912083145` | `secure_messaging` |
| `20260912083158` | `secure_messaging_rls_hardening` |
| `20260912141845` | `secure_instagram_connections` |
| `20260912154817` | `instagram_server_hardening` |
| `20260912160856` | `instagram_business_discovery` |
| `20260913102550` | `harden_messaging_function_permissions_and_rls` |
| `20260913102608` | `add_missing_foreign_key_indexes` |
| `20260913102728` | `clarify_instagram_rls_policies` |
| `20260913142524` | `restore_athlete_own_record_policies` |
| `20260913164024` | `add_payment_approval_flow` |
| `20260913170642` | `messaging_user_search_and_group_member_ids` |
| `20260914014946` | `messaging_user_search_rpc` |
| `20260914015014` | `harden_messaging_membership` |
| `20260914015212` | `messaging_user_search_and_id_rpcs` |
| `20260914015231` | `harden_security_definer_rpc_permissions` |
| `20260914015722` | `harden_payment_rpc_permissions_and_indexes` |
| `20260914072334` | `unique_messaging_usernames_v2` |
| `20260914073106` | `harden_security_definer_and_messaging_rls` |
| `20260914073116` | `add_missing_foreign_key_indexes` |
| `20260914170830` | `fix_messaging_rls_and_usernames` |
| `20260914172110` | `add_age_verification_profile_safety_v2` |
| `20260914172148` | `enforce_age_approval_rls` |
| `20260915081523` | `fix_parent_approval_token_generation` |
| `20260915100916` | `taekwondo_disciplines_core` |
| `20260915101016` | `taekwondo_profile_gender` |
| `20260915101731` | `taekwondo_index_rls_tuning` |
| `20260915153623` | `taekwondo_disciplines_v2` |
| `20260915153751` | `tournament_scanner_full_details` |
| `20260915161728` | `one_time_trial_and_profile_bootstrap` |
| `20260916103350` | `coach_academy_management_v1` |
| `20260916103407` | `coach_approval_decisions_and_links` |
| `20260916103706` | `coach_plan_role_provisioning` |
| `20260916103725` | `academy_coach_seat_management` |
| `20260917060630` | `day3_core_integrity_fixes` |
| `20260917060715` | `day3_security_definer_permissions` |
| `20260917060738` | `day3_reserved_username_function_permissions` |
| `20260917062021` | `qa_age_verification_override` |
| `20260917081345` | `coach_academy_management_rls` |
| `20260917081627` | `academy_owner_bootstrap_membership` |
| `20260917082915` | `add_secure_athlete_link_lookup` |
| `20260917083311` | `strict_trial_lifecycle` |
| `20260917084821` | `20260917_trial_payment_checkout` |
| `20260917101406` | `poomsae_training_details` |
| `20260918160916` | `messaging_attachments_20260918` |
| `20260918161155` | `one_time_trial_flag_20260918` |
| `20260921100511` | `super_admin_owner_access` |
| `20260921152405` | `mobile_profile_discipline_fields` |
| `20260922063954` | `owner_only_admin_role_assignment` |
| `20260922064809` | `coach_controlled_nutrition` |
| `20260922065053` | `nutrition_coach_relationship_fix` |
| `20260922070204` | `harden_age_verification_storage` |
| `20260922070221` | `tighten_age_and_lookup_security` |
| `20260922101906` | `athleten_team_connections_finance_messaging_privacy_v3` |
| `20260922101921` | `athleten_account_codes` |
| `20260922111113` | `fix_coach_finance_account_creation` |
| `20260922111938` | `coach_academy_connection_code` |
| `20260922112334` | `coach_tournament_manager` |
| `20260923080837` | `final_athleten_subscription_plans_and_ai_entitlements_v3` |
| `20260923081929` | `set_academy_ai_limit_1000` |
| `20260923082645` | `temporary_coach_test_role` |
| `20260923082659` | `set_test_coach_role` |
| `20260923082744` | `set_test_coach_role_retry` |
| `20260923083005` | `fix_coach_role_projection` |
| `20260923083911` | `coach_regular_training_groups` |
| `20260923084124` | `fix_training_group_rpc_uuid_loop` |
| `20260923085000` | `reliable_coach_training_system` |
| `20260923085340` | `fix_training_cancel_message_type` |
| `20260923085425` | `lock_down_training_security_definers` |
| `20260923090949` | `coach_messaging_account_codes_and_athlete_add` |
| `20260923091806` | `coach_training_integrity_constraints` |
| `20260923093859` | `custom_case_insensitive_account_codes` |
| `20260923094341` | `fix_coach_connection_code_save` |
| `20260923162619` | `harden_security_definer_anon_execute` |
| `20260923162642` | `fix_function_search_paths` |
| `20260924073730` | `remove_duplicate_indexes` |
| `20260924073733` | `add_fk_performance_indexes` |
| `20260925172800` | `fix_training_group_session_athlete_rls` |
| `20260925173337` | `tighten_coach_attendance_permissions` |
| `20260925173518` | `lock_down_public_security_definer_functions` |
| `20260925173558` | `restrict_trial_normalization_to_service_role` |
| `20260926092408` | `fix_role_specific_connection_code_lookup` |
| `20260926154200` | `set_novacode_qa_academy_plan` |
| `20260926154348` | `set_pratyaksh_qa_academy_plan` |
| `20260926154459` | `set_qa_accounts` |
| `20260926155020` | `set_novacode_academy_plan` |
| `20260927140900` | `academy_setup_onboarding` |
| `20260927161040` | `academy_contact_email_verification` |
| `20261007085834` | `messaging_controls` |
| `20261007090047` | `messaging_identity_and_settings_fix` |
| `20261007092928` | `athlete_journey_trust_layer` |
| `20261007094039` | `dashboard_widgets` |
| `20261007094223` | `weight_verification` |
| `20261007094253` | `athlete_record_audit_trail` |
| `20261007094654` | `add_weight_verification_queue` |
| `20261007100902` | `canonical_plan_ids_and_cross_device_navigation` |
| `20261007101151` | `preserve_navigation_order` |
| `20261007101349` | `tighten_connection_code_and_audit_function_access` |
| `20261007113940` | `canonicalize_live_plan_constraints` |
| `20261007114547` | `fix_change_account_plan_canonical_ids` |
| `20261007114720` | `mobile_cross_device_sync_security_hardening` |
| `20261007130311` | `founder_admin_and_founding_badges` |
| `20261007130414` | `auto_sync_system_badges` |
| `20261007131147` | `harden_badges_and_achievement_engine_20261007` |
| `20261007131318` | `tighten_badge_rpc_authorization_20261007` |
| `20261007131327` | `auto_evaluate_athlete_badges_20261007` |
| `20261007131423` | `lockdown_badge_trigger_functions_20261007` |
| `20261007132010` | `bootstrap_novacode_super_admin_20261007` |
| `20261007132037` | `super_admin_controls_and_audit_20261007` |
| `20261007132131` | `protect_privileged_profile_fields_20261007` |
| `20261007132151` | `seed_numbered_founding_athlete_badges_20261007` |
| `20261007132209` | `align_admin_ui_with_privileged_profile_guard_20261007` |
| `20261008094759` | `allow_protected_role_bootstrap_through_entitlement_projection_20261008` |
| `20261009070542` | `separate_athlete_plans_from_coach_academy_products_20261009` |
| `20261012165837` | `messaging_realtime_publication_20261012` |
| `20261012165843` | `allow_attachment_only_messages_20261012` |
| `20261028174845` | `launch_attendance_notifications` |
| `20261028180826` | `private_notifications_only_owner` |
| `20261028181613` | `gate_user_discovery_on_age_approval` |
| `20261029170219` | `index_uncovered_foreign_keys_20261029` |
| `20261029171052` | `restrict_trigger_function_rpc_execution_20261029` |
| `20261029171121` | `restrict_training_chat_trigger_rpc_20261029` |
| `20261101100225` | `message_delivery_receipts_and_notifications` |
| `20261101100529` | `fix_push_token_dispatch_and_announcement_alerts` |
| `20261101100819` | `target_announcement_notifications_by_audience` |
| `20261101100839` | `support_all_expo_push_token_prefixes` |
| `20261101101012` | `allow_conversation_receipt_visibility` |
| `20261103105030` | `message_notification_delivery_ack` |
| `20261103105237` | `dashboard_widget_preferences_rpc` |
| `20261103162053` | `ai_intelligence_reports` |
| `20261103162715` | `harden_ai_report_insert_entitlements` |
| `20261103162851` | `restrict_student_verification_to_athletes` |
| `20261103171241` | `harden_ai_reports_active_subscription_academy_verification` |
| `20261104101337` | `competition_checklists_tournament_scope` |
| `20261104103042` | `secure_messaging_and_coach_rpcs` |
| `20261104103647` | `enforce_announcement_audience_reads` |

## Local timestamps not recorded remotely

| Local timestamp | Local file(s) |
|---|---|
| `20260912` | `20260912_instagram_business_discovery.sql`<br>`20260912_instagram_connections.sql`<br>`20260912_instagram_server_hardening.sql`<br>`20260912_secure_messaging.sql`<br>`20260912_secure_messaging_rls_hardening.sql`<br>`20260912_upload_size_limit.sql` |
| `20260913` | `20260913_add_missing_foreign_key_indexes.sql`<br>`20260913_add_payment_approval_flow.sql`<br>`20260913_clarify_instagram_rls_policies.sql`<br>`20260913_harden_messaging_function_permissions_and_rls.sql`<br>`20260913_restore_athlete_own_record_policies.sql` |
| `20260914200000` | `20260914200000_age_verification_profile_safety.sql` |
| `20260914200500` | `20260914200500_direct_messaging_by_username.sql` |
| `20260914201000` | `20260914201000_user_selected_usernames.sql` |
| `20260914201500` | `20260914201500_message_report_admin_updates.sql` |
| `20260914` | `20260914_fix_messaging_rls_and_usernames.sql`<br>`20260914_harden_messaging_membership.sql`<br>`20260914_harden_payment_rpc_permissions_and_indexes.sql`<br>`20260914_messaging_user_search.sql`<br>`20260914_messaging_user_search_and_id_rpcs.sql`<br>`20260914_unique_messaging_usernames.sql`<br>`20260914_user_chosen_usernames_and_novacode_contact.sql` |
| `20260915000000` | `20260915000000_taekwondo_disciplines.sql` |
| `20260915010000` | `20260915010000_tournament_scanner_full_details.sql` |
| `20260915210000` | `20260915210000_one_time_trial_and_profile_bootstrap.sql` |
| `20260915213000` | `20260915213000_trial_payment_placeholder.sql`<br>`20260915213000_trial_pricing_and_access.sql` |
| `20260916143000` | `20260916143000_coach_academy_management.sql` |
| `20260916144500` | `20260916144500_coach_academy_workflows.sql` |
| `20260916145500` | `20260916145500_coach_plan_roles.sql` |
| `20260917120000` | `20260917120000_day3_core_integrity_fixes.sql` |
| `20260917121000` | `20260917121000_day3_security_definer_permissions.sql` |
| `20260917121500` | `20260917121500_day3_reserved_username_function_permissions.sql` |
| `20260917130000` | `20260917130000_strict_trial_lifecycle.sql` |
| `20260917150000` | `20260917150000_poomsae_training_details.sql` |
| `20260917200000` | `20260917200000_fix_instagram_discovery_login.sql` |
| `20260917` | `20260917_trial_payment_checkout.sql` |
| `20260918170000` | `20260918170000_messaging_attachments.sql` |
| `20260921000000` | `20260921000000_mobile_profile_discipline_fields.sql` |
| `20260922000000` | `20260922000000_coach_controlled_nutrition.sql` |
| `20260922010000` | `20260922010000_age_verification_hardening.sql` |
| `20260922070300` | `20260922070300_age_verification_hardening.sql` |
| `20260922120000` | `20260922120000_athleten_account_codes.sql` |
| `20260922120100` | `20260922120100_athleten_team_connections_finance.sql` |
| `20260922150000` | `20260922150000_fix_coach_finance_account_creation.sql` |
| `20260922153000` | `20260922153000_coach_academy_connection_code.sql` |
| `20260922160000` | `20260922160000_coach_tournament_manager.sql` |
| `20260922193000` | `20260922193000_fix_coach_messaging_and_navigation.sql` |
| `20260923100000` | `20260923100000_custom_case_insensitive_account_codes.sql` |
| `20260923120000` | `20260923120000_academy_workspace_read_access.sql` |
| `20260923121500` | `20260923121500_academy_tournament_management.sql` |
| `20260923133000` | `20260923133000_academy_workspace_hardening.sql` |
| `20260923143000` | `20260923143000_harden_security_definer_anon_execute.sql` |
| `20260923144000` | `20260923144000_fix_function_search_paths.sql` |
| `20260923150000` | `20260923150000_username_identity_and_messaging.sql` |
| `20260923151000` | `20260923151000_username_account_code_sync.sql` |
| `20260924090000` | `20260924090000_remove_duplicate_indexes.sql` |
| `20260924092000` | `20260924092000_add_fk_performance_indexes.sql` |
| `20260925065314` | `20260925065314_mobile_notifications_and_streak_support.sql` |
| `20260926210000` | `20260926210000_policy_acceptance.sql` |
| `20261007120000` | `20261007120000_canonical_plan_ids_and_navigation_sync.sql` |
| `20261007121500` | `20261007121500_preserve_navigation_order.sql` |
| `20261007123000` | `20261007123000_tighten_connection_code_and_audit_function_access.sql` |
| `20261007133000` | `20261007133000_enforce_canonical_plan_constraints.sql`<br>`20261007133000_harden_badges_and_achievement_engine.sql` |
| `20261007134000` | `20261007134000_tighten_badge_rpc_authorization.sql` |
| `20261007140000` | `20261007140000_messaging_identity_and_settings.sql` |
| `20261007143000` | `20261007143000_messaging_controls.sql` |
| `20261009150000` | `20261009150000_coach_academy_product_workspaces.sql` |
| `20261009211000` | `20261009211000_normalize_profile_taxonomy_server_side.sql` |
| `20261012180000` | `20261012180000_messaging_realtime_publication.sql` |
| `20261012183000` | `20261012183000_allow_attachment_only_messages.sql` |
| `20261028190000` | `20261028190000_launch_attendance_notifications.sql` |
| `20261028200000` | `20261028200000_gate_user_discovery_on_age_approval.sql` |
| `20261029170000` | `20261029170000_index_uncovered_foreign_keys.sql` |
| `20261029171000` | `20261029171000_restrict_trigger_function_rpc_execution.sql` |
| `20261029171500` | `20261029171500_restrict_training_chat_trigger_rpc.sql` |
| `20261101153000` | `20261101153000_message_delivery_receipts_and_notifications.sql` |
| `20261101153100` | `20261101153100_fix_push_token_dispatch_and_announcement_alerts.sql` |
| `20261101154500` | `20261101154500_target_announcement_notifications_by_audience.sql` |
| `20261101154600` | `20261101154600_support_all_expo_push_token_prefixes.sql` |
| `20261101160000` | `20261101160000_allow_conversation_receipt_visibility.sql` |
| `20261103110000` | `20261103110000_message_notification_delivery_ack.sql` |
| `20261103110200` | `20261103110200_dashboard_widget_preferences_rpc.sql` |
| `20261103130000` | `20261103130000_ai_intelligence_reports.sql` |
| `20261103133000` | `20261103133000_harden_ai_report_insert_entitlements.sql` |
| `20261103134000` | `20261103134000_restrict_student_verification_to_athletes.sql` |
| `20261103170000` | `20261103170000_harden_ai_reports_active_subscription_academy_verification.sql` |
| `20261111160000` | `20261111160000_consolidate_duplicate_direct_message_threads.sql` |

## Duplicate local timestamp prefixes

| Timestamp | Conflicting files |
|---|---|
| `20260912` | `20260912_instagram_business_discovery.sql`<br>`20260912_instagram_connections.sql`<br>`20260912_instagram_server_hardening.sql`<br>`20260912_secure_messaging.sql`<br>`20260912_secure_messaging_rls_hardening.sql`<br>`20260912_upload_size_limit.sql` |
| `20260913` | `20260913_add_missing_foreign_key_indexes.sql`<br>`20260913_add_payment_approval_flow.sql`<br>`20260913_clarify_instagram_rls_policies.sql`<br>`20260913_harden_messaging_function_permissions_and_rls.sql`<br>`20260913_restore_athlete_own_record_policies.sql` |
| `20260914` | `20260914_fix_messaging_rls_and_usernames.sql`<br>`20260914_harden_messaging_membership.sql`<br>`20260914_harden_payment_rpc_permissions_and_indexes.sql`<br>`20260914_messaging_user_search.sql`<br>`20260914_messaging_user_search_and_id_rpcs.sql`<br>`20260914_unique_messaging_usernames.sql`<br>`20260914_user_chosen_usernames_and_novacode_contact.sql` |
| `20260915213000` | `20260915213000_trial_payment_placeholder.sql`<br>`20260915213000_trial_pricing_and_access.sql` |
| `20261007133000` | `20261007133000_enforce_canonical_plan_constraints.sql`<br>`20261007133000_harden_badges_and_achievement_engine.sql` |

## Safe reconciliation procedure

1. Recover the original migration files and their exact timestamps from trusted Git history, backups, or release artifacts wherever possible.
2. For any remote timestamp whose original SQL cannot be recovered, do not invent a placeholder. First establish the exact schema/data effects by inspecting current live definitions, then document an approved baseline/squash strategy with a tested clean-install path.
3. For each local-only timestamp, compare its SQL effects with live schema and data before deciding whether it is genuinely unapplied, superseded, or duplicate. Never blindly push it.
4. Resolve only individual timestamps whose SQL effect is already present or whose migration was demonstrably never applied. Use `supabase migration repair` only after that evidence exists; it changes history only, not schema.
5. Validate the complete ordered chain on a disposable local PostgreSQL/Supabase stack and rerun `supabase migration list` against the remote. Do not reset production or create paid staging as a shortcut.

## Sources and scope

- Supabase CLI reference: <https://supabase.com/docs/reference/cli/supabase-migration-list>
- Production list was read-only. No migration ledger rows or production schema were changed to create this inventory.
