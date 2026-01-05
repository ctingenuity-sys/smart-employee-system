import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qhtstprghtbyvqpcqhro.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFodHN0cHJnaHRieXZxcGNxaHJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Mjg1ODcsImV4cCI6MjA4MzEwNDU4N30.LcMmbtV_QVxmeRY56guGvUKRqF0-3qtHCHfS7qLcJek';

export const supabase = createClient(supabaseUrl, supabaseKey);