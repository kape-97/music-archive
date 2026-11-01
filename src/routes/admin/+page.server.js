import { redirect } from "@sveltejs/kit";

export function load({ locals }) {
  const admin = locals.admin;

  if (!admin || admin.role !== "ADMIN") {
    redirect(303, "/");
  }

  return {
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role
    }
  };
}