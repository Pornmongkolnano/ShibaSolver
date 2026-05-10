export async function uploadImageToCloudinary(file: File): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error(
      "Cloudinary env missing: NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME or NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"
    );
  }

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", uploadPreset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || "Upload failed";
    throw new Error(msg);
  }

  if (!data.secure_url) {
    throw new Error("Cloudinary upload response did not include secure_url");
  }

  return data.secure_url;
}
