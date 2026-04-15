export interface ResourceMeta {
    id: string;
    name: string;
    type: string;
}

export interface CompileBody {
    projectPath: string;
    resourceIds: string[];
    resources: ResourceMeta[];
    includeHeaders: boolean;
    projectName: string;
}
