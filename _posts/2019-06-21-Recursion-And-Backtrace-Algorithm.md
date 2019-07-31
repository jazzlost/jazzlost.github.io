---
layout: post
title: "递归与回溯思路的理解"
subtitle: "Study About Recursion And Backtrace"
author: "李AA"
header-img: "img/blog-bg-cloud.jpg"
tags:
    - Algorithm
    - C++
---

* TOC
{:toc}

# 前言
* 初学递归时，我总会下意识地用大脑去自检递归，这样的结果肯定是不正确的。在调用栈层级大于3层时，人脑基本就无法很好的理清调用栈层次了。动态规划和递归应该是算法学习中最容易进入误区的两个地方。其实写递归是有方法步骤的。分析问题得出```递推公式```，然后找出```终止条件```，最后实现```递归函数```中的操作。学习用递归来实现五大常用算法之一的回溯，可以加深对于循环中的递归和深度优先算法(DFS)的理解。

* 递归问题满足三个条件
  *  一个问题可以分解为几个子问题的解。
  *  主问题和分解后的子问题除了数据规模不同，求解思路相同。
  *  存在递归终止条件。

# 递归 Recursion
* ## 上楼梯问题
  假如有n阶台阶，每次可以走1阶或者2阶，请问有多少种走法。
  * ```递推公式```：如果先走了一阶以后剩下n-1阶台阶的走法，加上如果先走了2阶以后剩下n-2阶的走法。总共走法f(n) = f(n-1) + f(n-2)。
  
  * ```终止条件```：如果最后还剩一阶，则只有一种走法f(1) = 1。如果最后还剩2阶则有两种走法f(2) = 2。
  
  * ```递归函数```：
  
  ```cpp
  
    int foo(int n)
    {
        if(n == 1)
          return 1;
        if(n == 2)
          return 2;
        return f(n-1) + f(n-2);
    } 
  ```

* ## 归并排序
  Merge Sort是一种时间复杂度为O(nlogn)的排序方式，巧妙地运用了分治的思路和递归的技巧。整体思路是将要排序的数据不断平分直到分解为不可分单元，然后对不可分单元进行排序合并，最后组合为排序好的数据整体。算法分为sort和merge两部分。

  ![](\img\in-post\RecursionAndBacktrace\sort.png)
  ![](\img\in-post\RecursionAndBacktrace\merge.png)

  * ```递推公式```：sort(left, right) = sort(sort(left, mid), sort(mid+1, right))
   
  * ```终止条件```：left >= right
  
  * ```递归函数```：
  
  ```cpp
    //------------sort---------------------------------------------
    void sort(std::vector<int>& nums, int left, int right)
    {
      if(left >= right)
        return;
      int mid = (left + right) / 2;
      //平分左部分
      sort(nums, left , mid);
      //平分右部分
      sort(nums, mid + 1, right);
      //合并排序左右部分
      merge(nums, left, mid , right);
    }

    //--------------merge------------------------------------------
    void merge(std::vector<int>& nums, int left, int mid, int right)
    {
      std::vector<int> sorted;
      //两个位置指针分别指向左部分开头和右部份开头
      int p1 = left;
      int p2 = mid + 1;

      //两个位置指针都没到分组末尾
      while(l <= mid && r <= right)
      {
        //把左右指针中较小的放入暂存数组
        if(nums[p1] <= nums[p2])
        {
          sorted.push_back(nums[p1]);
          p1++;
        }
        else
        {
          sorted.push_back(nums[p2])
          p2++;
        }
      }
      //左右指针中有一个走到末尾后，把另一组剩下的数据放入暂存数组中
      while(p1<=mid)
      {
        sorted.push_back(nums[p1]);
        p1++;
      }
      while(p2 <= right)
      {
        sorted.push_back(nums[p1]);
        p1++;
      }

      //把暂存数组数据移动到原数组
      for(int i = 0; i < sorted.size(); i++)
      {
        nums[left + i] = sorted[i];
      }
    }
  ```

# 回溯 Backtrack
* 回溯类题目属于多解问题，这种问题一般通过构建解空间树，运用BFS或者DFS方式来遍历搜索，然后用剪枝函数剔除不满足条件的节点，多次迭代来组合出多组解。下面是用DFS求解的模板：
  
  ```cpp
    template<typename T>
    void DFS(vector<T>& res, vector<T>& temp, int start)
    {
      //剪枝函数,提出不满出条件的解，同时把满足条件的解放入结果容器
      if(...)
      {
        res.push_back(temp);
        return;
      }

      //DFS遍历迭代
      for(int i = start; i < res.size(); i++)
      {
        //把解空间树的节点先放入临时容器
        temp.push_back(i);
        //递归x下一层的节点
        //这里传入的start参数根据题目要求会有不同，一般来说解中可以重复此节点的传入i，不可以重复  的传入i+1
        DFS(res, temp, i);
        //每次找到一组解后需要弹出临时容器最后一个元素，以便新的查找插入
        temp.pop_back();
      }
    }
  ```
  
* ## Letter Combinations of a Phone Number
  给一个包含数字2-9的字符串映射到电话按键上，返回所有可能的字母组合。
  ![](\img\in-post\RecursionAndBacktrace\phone.png)
  
  ```cpp  
    class Solution
    {
    public：
        void findCombinations(std::string digits, int index, std::string foundStr)
        {
           //剪枝函数
           if(index == digits.size())
           {
             res.push_back(foundStr);
             return;
           }

           char digit = digits[index];
           //取出数字对应字符串
           std::string subStr = m_map.find(digit)->second;

           for(int i = 0; i < subStr.size(); i++)
           {
             //把找到字符放入字符集
             foundStr.push_back(subStr[i]);
             //递归下一层
             findCombinations(digits, index+1, foundStr);
             //回溯之前删除最后一个字符
             foundStr.erase(index);
           }
        }

        //入口调用函数
        vector<std::string> letterCombinations(std::string digits)
        {
          if(digits == "")
            return m_res;

          std::string foundStr;
          findCombinations(digits, 0, foundStr);

           return m_res;
        }


    private:
        std::map<char, const std::string> m_map
        {
            {'2', "abc"},
            {'3', "def"},
            {'4', "ghi"},
            {'5', "jkl"},
            {'6', "mno"},
            {'7', "pqrs"},
            {'8', "tuv"},
            {'9', "wxyz"}
        };

        std::vector<std::string> m_res; 
    }
  ```


* ## Permutations
  排列问题。给一个数组，输出所有可能的排列。
  ```
  Example:
  Input: [1,2,3]
  Output:
  [
    [1,2,3],
    [1,3,2],
    [2,1,3],
    [2,3,1],
    [3,1,2],
    [3,2,1]
  ]
  ```
  这道题思路和前面一道基本相同，也是递归在回溯中的运用。

  ```cpp
    class Solution 
    {
    public:
        std::vector<std::vector<int>> permute(std::vector<int>& nums) 
        {
            if(nums.size() == 0)
              return m_res;

            m_valid = std::vector<bool>(nums.size(), true);
            std::vector<int> out;
            DFS(nums, out);
            return m_res;
        }

        void DFS(std::vector<int>& nums, std::vector<int>& out)
        {
            //剪枝函数
            if(out.size() == nums.size())
            {
                m_res.push_back(out);
                return;
            } 

            for(int i = 0; i < nums.size(); i++)
            {
                //因为每个数只能用一次，且每次迭代需要遍历所有可能，所以标记用过的节点
                if(m_valid[i])
                {
                    out.push_back(nums[i]);
                    m_valid[i] = false;
                    DFS(nums, index+1, out);
                    out.pop_back();
                    m_valid[i] = true;
                }
            }
            return;
        }
    }
  ```

* ## Combinations
  给两个整数n和k， 返回所有k个数的组合，取值范围是1~n
  ```
  Example:

  Input: n = 4, k = 2
  Output:
  [
    [2,4],
    [3,4],
    [2,3],
    [1,2],
    [1,3],
    [1,4],
  ]
  ```
  
  ```cpp
    class Solution 
    {
    public:
        std::vector<std::vector<int>> combine(int n, int k) 
        {
            std::vector<std::vector<int>> res;
            std::vector<int> temp;
          
            if(n < 1 || k > n)
              return res;
          
            DFS(res, temp, n, k, 0);
          
            return res;
        }
  
        void DFS(std::vector<std::vector<int>>& res, std::vector<int>& temp,
                int n, int k, int start)
        {
            //剪枝函数
            if(temp.size() == k)
            {
                res.push_back(temp);
                return;
            }
                    
            for(int i = start; i < n; ++i)
            {
                temp.push_back(i + 1);
                //数字不能重复使用所以递归参数用i+1
                DFS(res, temp, n, k, i+1);
                temp.pop_back();                      
            }
        }
    };
  ```

    



