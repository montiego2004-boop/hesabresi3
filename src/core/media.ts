import { check, type Media } from './model';

export function validateMedia(data: string, imageOnly = false) {
  check(
    typeof data === 'string' &&
      data.length <= 12 * 1024 * 1024 &&
      (/^data:image\/png;base64,iVBORw0KGgo/.test(data) ||
        /^data:image\/jpeg;base64,\/9j\//.test(data) ||
        (!imageOnly && /^data:application\/pdf;base64,JVBERi0/.test(data))),
    'فایل باید تصویر PNG، JPEG یا پی‌دی‌اف معتبر و کمتر از ۸ مگابایت باشد.',
  );
}
export async function readMedia(
  file: File,
  imageOnly = false,
): Promise<Pick<Media, 'data' | 'name'>> {
  check(file.size <= 8 * 1024 * 1024, 'حداکثر اندازه فایل ۸ مگابایت است.');
  const data = await new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => no(Error('خواندن فایل ممکن نشد.'));
    r.readAsDataURL(file);
  });
  validateMedia(data, imageOnly);
  if (data.startsWith('data:image/')) {
    const im = new Image();
    im.src = data;
    try {
      await im.decode();
    } catch {
      throw Error('تصویر قابل خواندن نیست.');
    }
    check(im.naturalWidth * im.naturalHeight <= 25000000, 'ابعاد تصویر بیش از حد بزرگ است.');
  }
  return { name: file.name, data };
}
