-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_parentId_fkey";

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
