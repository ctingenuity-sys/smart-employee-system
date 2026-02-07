
import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// إعدادات سوبابيز - SUPABASE SETUP
// ------------------------------------------------------------------

const SUPABASE_URL = 'https://vcmqrhxtbuxvgvtbclew.supabase.co';
const SUPABASE_KEY = 'sb_publishable_364wRpHbFj-BE5i4-BJxCQ_xARd5YwA';

// التحقق من الإعدادات
if (!SUPABASE_URL || !SUPABASE_KEY || (SUPABASE_KEY as string) === 'YOUR_ANON_KEY_HERE') {
  console.warn(
    '⚠️ تنبيه: يرجى التأكد من مفاتيح Supabase ليعمل الرفع.'
  );
}

export const supabaseStorageClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const STORAGE_FIX_SQL = `
-- 1. Enable RLS on storage.objects (Safety First)
alter table storage.objects enable row level security;

-- 2. Create the 'documents' bucket if it doesn't exist
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
values ('documents', 'documents', true, null, null) 
on conflict (id) do update set public = true;

-- 3. Drop ALL existing policies to avoid conflicts/errors
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Public Storage" on storage.objects;
drop policy if exists "Give me access" on storage.objects;
drop policy if exists "Public Select" on storage.objects;
drop policy if exists "Public Insert" on storage.objects;
drop policy if exists "Public Update" on storage.objects;
drop policy if exists "Public Delete" on storage.objects;
drop policy if exists "Public Access Select" on storage.objects;
drop policy if exists "Public Access Insert" on storage.objects;
drop policy if exists "Public Access Update" on storage.objects;
drop policy if exists "Public Access Delete" on storage.objects;

-- 4. Create comprehensive PUBLIC policies for the 'documents' bucket
create policy "Public Access Select" on storage.objects for select using ( bucket_id = 'documents' );
create policy "Public Access Insert" on storage.objects for insert with check ( bucket_id = 'documents' );
create policy "Public Access Update" on storage.objects for update using ( bucket_id = 'documents' );
create policy "Public Access Delete" on storage.objects for delete using ( bucket_id = 'documents' );
`;

/**
 * دالة مساعدة لإظهار نافذة الإصلاح عند حدوث خطأ
 */
const showFixModal = (sql: string) => {
  // Check if modal already exists
  if (document.getElementById('supabase-fix-modal')) return;

  const modalHtml = `
    <div id="supabase-fix-modal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(5px);">
      <div style="background: #0f172a; border: 1px solid #ef4444; border-radius: 16px; width: 100%; max-width: 600px; padding: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
        <h3 style="color: #ef4444; font-size: 20px; font-weight: bold; margin-bottom: 12px; font-family: sans-serif;">Upload Issue Detected</h3>
        <p style="color: #94a3b8; font-size: 14px; margin-bottom: 16px; font-family: sans-serif;">
          We encountered an error uploading your file to the new storage. This is usually due to bucket configuration.
          <br/><br/>
          Please run the following SQL command in your Supabase SQL Editor to fix this:
        </p>
        <div style="background: #000; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; position: relative; margin-bottom: 20px;">
          <pre style="color: #4ade80; font-family: monospace; font-size: 12px; overflow-x: auto; white-space: pre-wrap; max-height: 200px; overflow-y: auto; margin: 0;">${sql}</pre>
          <button onclick="navigator.clipboard.writeText(\`${sql.replace(/`/g, '\\`')}\`); this.innerText = 'Copied!';" style="position: absolute; top: 8px; right: 8px; background: #1e293b; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer;">Copy SQL</button>
        </div>
        <button onclick="document.getElementById('supabase-fix-modal').remove()" style="width: 100%; padding: 12px; background: #334155; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background 0.2s;">Close</button>
      </div>
    </div>
  `;
  
  const div = document.createElement('div');
  div.innerHTML = modalHtml;
  document.body.appendChild(div.firstElementChild!);
};

/**
 * دالة لرفع الملفات إلى سوبابيز
 */
export const uploadFile = async (file: File, folder: string = 'general'): Promise<string | null> => {
  try {
    // 1. Sanitize filename: ASCII only, remove special chars to prevent HTTP 400 errors
    const fileExt = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
    const cleanFileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

    // 2. Upload with explicit content type
    const { error: uploadError } = await supabaseStorageClient.storage
      .from('documents')
      .upload(cleanFileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream' // Ensure content type is set
      });

    if (uploadError) {
      console.error('Upload Error Details:', uploadError);
      
      // Check for common permission or configuration errors
      if (
        uploadError.message.includes('row-level security') || 
        uploadError.message.includes('policy') ||
        uploadError.message.includes('permission') ||
        uploadError.message.includes('400') ||
        uploadError.message.toLowerCase().includes('http 400')
      ) {
         showFixModal(STORAGE_FIX_SQL);
      } else {
         alert('Upload Failed: ' + uploadError.message);
      }
      return null;
    }

    const { data } = supabaseStorageClient.storage
      .from('documents')
      .getPublicUrl(cleanFileName);

    return data.publicUrl;
  } catch (error) {
    console.error('Unexpected error:', error);
    alert('An unexpected error occurred during upload.');
    return null;
  }
};
