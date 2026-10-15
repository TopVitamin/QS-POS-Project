import type { Perm } from '@/shared/config/permissions'

export {}

/** 三个端共用一份路由元信息声明，各端只用自己那几项 */
declare module 'vue-router' {
  interface RouteMeta {
    /** 有其中任一权限就能进 */
    perms?: Perm[]
    /** 收银端左侧导航 */
    nav?: { label: string; icon: string }
    /** 管理端、移动端的页面标题 */
    title?: string
    /** 管理端菜单分组和图标 */
    group?: string
    icon?: string
    /** 详情页高亮哪个菜单项 */
    menu?: string
    /** 移动端底部标签页 */
    tab?: boolean
  }
}
