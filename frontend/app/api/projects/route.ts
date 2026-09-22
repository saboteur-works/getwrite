import { NextResponse } from "next/server";
import {
  createProjectCore,
  listProjectsCore,
  MissingProjectFieldsError,
  ProjectTypeNotFoundError,
} from "../../../src/lib/models/project-crud-core";
import { isLockedAccessError } from "../../../src/lib/models/locked-access";
import { withStorageContext } from "../_tenant/with-storage-context";

/**
 * Get all projects from the local filesystem. Each project includes its metadata, folders, and resources.
 */
async function getProjects() {
  try {
    const projects = await listProjectsCore();
    return NextResponse.json(projects);
  } catch (err) {
    // A locked-access error must propagate uncaught so `withStorageContext`'s
    // centralised mapping (Task 13) can turn it into a 401/409, rather than
    // being swallowed into this route's generic 500 shape (FR-14).
    if (isLockedAccessError(err)) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function createProject(req: Request) {
  try {
    const body = await req.json();
    const { name, projectType } = body as {
      name?: string;
      projectType?: string;
    };

    const result = await createProjectCore(name, projectType);

    return NextResponse.json(result);
  } catch (err) {
    if (isLockedAccessError(err)) {
      throw err;
    }
    if (err instanceof MissingProjectFieldsError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof ProjectTypeNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = withStorageContext(getProjects);
export const POST = withStorageContext(createProject);

export const dynamic = "force-dynamic";
