import checkDiskSpaceImport from "check-disk-space";
import path from "path";

// For CommonJS default export compatibility
const checkDiskSpace =
  typeof checkDiskSpaceImport === "function"
    ? checkDiskSpaceImport
    : checkDiskSpaceImport.default;

export async function canFitOnDisk(
  sizeInBytes: number,
  targetPath: string = "./", // defualt to root path
  safetyBufferBytes: number = 100 * 1024 * 1024 // 100 MB safety buffer
): Promise<boolean> {
  try {
    const diskSpace = await checkDiskSpace(path.resolve(targetPath));
    const availableSpace = diskSpace.free - safetyBufferBytes;
    return sizeInBytes <= availableSpace;
  } catch (error) {
    console.error("Error checking disk space:", error);

    // Return false as a safe default when we can't determine disk space
    return false;
  }
}
