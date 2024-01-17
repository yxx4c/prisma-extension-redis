import { Cache } from 'async-cache-dedupe';
import { ExtendedModel, PrismaRedisExtensionConfig } from './types';
export declare const PrismaRedisExtension: (config: PrismaRedisExtensionConfig) => (client: any) => import("@prisma/client/extension").PrismaClientExtends<import("@prisma/client/runtime/library").InternalArgs<{}, {
    $allModels: ExtendedModel;
}, {}, {
    redis: import("ioredis/built/Redis").default;
    cache: Cache;
}>>;
