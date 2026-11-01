
import { redirect } from "@sveltejs/kit";

/** @type {import('./$types').LayoutServerLoad} */
export function load({ locals }) {
  const admin = locals.admin;

  // Protect every page inside the /admin route.
  if (!admin || admin.role !== "ADMIN") {
    redirect(303, "/");
  }

  // Expose only the account details needed by the shared layout.
  return {
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role
    }
  };
}
