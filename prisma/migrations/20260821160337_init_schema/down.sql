-- Retour arrière de `init_schema` (SETUP-007).
-- Ramène le schéma `public` à l'état vide qui précédait la migration.

DROP TABLE IF EXISTS "audit_logs" CASCADE;
DROP TABLE IF EXISTS "comments" CASCADE;
DROP TABLE IF EXISTS "notification_preferences" CASCADE;
DROP TABLE IF EXISTS "notification_deliveries" CASCADE;
DROP TABLE IF EXISTS "notifications" CASCADE;
DROP TABLE IF EXISTS "blocked_periods" CASCADE;
DROP TABLE IF EXISTS "space_assignments" CASCADE;
DROP TABLE IF EXISTS "stay_guests" CASCADE;
DROP TABLE IF EXISTS "stays" CASCADE;
DROP TABLE IF EXISTS "stay_requests" CASCADE;
DROP TABLE IF EXISTS "event_item_claims" CASCADE;
DROP TABLE IF EXISTS "event_items" CASCADE;
DROP TABLE IF EXISTS "activity_participants" CASCADE;
DROP TABLE IF EXISTS "event_activities" CASCADE;
DROP TABLE IF EXISTS "event_participants" CASCADE;
DROP TABLE IF EXISTS "events" CASCADE;
DROP TABLE IF EXISTS "booking_settings" CASCADE;
DROP TABLE IF EXISTS "house_rules" CASCADE;
DROP TABLE IF EXISTS "spaces" CASCADE;
DROP TABLE IF EXISTS "houses" CASCADE;
DROP TABLE IF EXISTS "password_reset_tokens" CASCADE;
DROP TABLE IF EXISTS "invitations" CASCADE;
DROP TABLE IF EXISTS "sessions" CASCADE;
DROP TABLE IF EXISTS "accounts" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

DROP TYPE IF EXISTS "CommentEntityType";
DROP TYPE IF EXISTS "DeliveryStatus";
DROP TYPE IF EXISTS "NotificationChannel";
DROP TYPE IF EXISTS "BlockedPeriodType";
DROP TYPE IF EXISTS "StayPrivacy";
DROP TYPE IF EXISTS "StayStatus";
DROP TYPE IF EXISTS "StayRequestStatus";
DROP TYPE IF EXISTS "ParticipantStatus";
DROP TYPE IF EXISTS "EventStatus";
DROP TYPE IF EXISTS "SpaceType";
DROP TYPE IF EXISTS "RelationType";
DROP TYPE IF EXISTS "UserStatus";
DROP TYPE IF EXISTS "Role";
