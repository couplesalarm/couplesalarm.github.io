-- Extend the existing fixed campaign labels without storing arbitrary UTM values.
alter table public.couples_alarm_page_views
    drop constraint couples_alarm_page_views_campaign_check,
    add constraint couples_alarm_page_views_campaign_check
        check (campaign is null or campaign in (
            'owned_website', 'paid_facebook_iphone', 'paid_instagram_iphone',
            'paid_youtube_iphone', 'paid_tiktok_iphone', 'tracking_qa'
        ));
